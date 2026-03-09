"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateAccountSchema,
  UpdateAccountSchema,
} from "@/lib/validations/account.schema";
import { getOrFetchFxRate } from "@/actions/fx";
import type { Account, Currency } from "@/types/accounts";

/** Devuelve el opening_base_amount correcto usando FX si es necesario. */
async function resolveOpeningBase(
  openingAmount: number,
  accountCurrency: string,
  baseCurrency: string,
  providedBase: number | undefined,
  providedRate: number | undefined,
): Promise<number> {
  if (openingAmount === 0) return 0;
  if (accountCurrency === baseCurrency) return openingAmount;
  // Si el usuario ingresó explícitamente el monto base, respetarlo
  if (providedBase !== undefined && providedBase > 0) return providedBase;
  // Si hay un TC válido distinto de 1 ingresado por el usuario, usarlo
  if (providedRate !== undefined && providedRate > 0 && providedRate !== 1) {
    return Math.round(openingAmount * providedRate * 100) / 100;
  }
  // Obtener TC actual del servidor (con caché en DB)
  const today = new Date().toISOString().slice(0, 10);
  const result = await getOrFetchFxRate({ date: today, from: accountCurrency, to: baseCurrency });
  if ("error" in result) return 0; // crypto u otras monedas no soportadas
  return Math.round(openingAmount * result.data * 100) / 100;
}

type ActionResult<T> = { data: T } | { error: string };

// --- GET ACCOUNTS ---
export async function getAccounts(): Promise<ActionResult<Account[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) return { error: error.message };
    return { data: (data ?? []) as Account[] };
  } catch {
    return { error: "Error al obtener las cuentas" };
  }
}

// --- GET CURRENCIES ---
export async function getCurrencies(): Promise<ActionResult<Currency[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("currencies")
      .select("*")
      .order("code", { ascending: true });

    if (error) return { error: error.message };
    return { data: (data ?? []) as Currency[] };
  } catch {
    return { error: "Error al obtener las monedas" };
  }
}

// --- GET ACCOUNT INITIAL BALANCE ---
export async function getAccountInitialBalance(
  accountId: string,
): Promise<ActionResult<{ opening_amount: number; opening_base_amount: number }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: earliestMonth } = await supabase
      .from("months")
      .select("id")
      .eq("user_id", user.id)
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!earliestMonth) {
      return { data: { opening_amount: 0, opening_base_amount: 0 } };
    }

    const { data, error } = await supabase
      .from("opening_balances")
      .select("opening_amount, opening_base_amount")
      .eq("month_id", earliestMonth.id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) return { error: error.message };

    return {
      data: {
        opening_amount: Number(data?.opening_amount ?? 0),
        opening_base_amount: Number(data?.opening_base_amount ?? 0),
      },
    };
  } catch {
    return { error: "Error al obtener el saldo inicial" };
  }
}

// --- CREATE ACCOUNT ---
export async function createAccount(
  input: unknown,
): Promise<ActionResult<Account>> {
  try {
    const parsed = CreateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { initial_amount, exchange_rate, base_amount, ...accountFields } = parsed.data;
    const openingAmount = initial_amount ?? 0;

    const { data, error } = await supabase
      .from("accounts")
      .insert({ ...accountFields, user_id: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "Ya existe una cuenta con ese nombre y moneda" };
      }
      return { error: error.message };
    }

    // Obtener moneda base del usuario para calcular opening_base_amount
    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", user.id)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    const openingBase = await resolveOpeningBase(
      openingAmount,
      accountFields.currency,
      baseCurrency,
      base_amount,
      exchange_rate,
    );

    const { data: months, error: monthsError } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", user.id);

    if (monthsError) return { error: monthsError.message };

    // Ensure the current calendar month is included (may not exist yet if
    // the dashboard hasn't been loaded for this period)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthList = months ?? [];
    const hasCurrentMonth = monthList.some(
      (m) => m.year === currentYear && m.month === currentMonth,
    );

    if (!hasCurrentMonth) {
      // Try to create the current month row so we can attach an opening balance
      const { data: newMonthRow } = await supabase
        .from("months")
        .insert({ user_id: user.id, year: currentYear, month: currentMonth })
        .select("id, year, month")
        .single();
      if (newMonthRow) monthList.push(newMonthRow);
    }

    const openingRows = monthList.map((month) => ({
      month_id: month.id,
      account_id: data.id,
      opening_amount: openingAmount,
      opening_base_amount: openingBase,
    }));

    if (openingRows.length > 0) {
      const { error: openingError } = await supabase
        .from("opening_balances")
        .upsert(openingRows, { onConflict: "month_id,account_id" });

      if (openingError) return { error: openingError.message };
    }

    return { data: data as Account };
  } catch {
    return { error: "Error al crear la cuenta" };
  }
}

// --- UPDATE ACCOUNT ---
export async function updateAccount(
  input: unknown,
): Promise<ActionResult<Account>> {
  try {
    const parsed = UpdateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const { id, initial_amount, exchange_rate, base_amount, ...accountUpdates } = parsed.data;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("accounts")
      .update(accountUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "Ya existe una cuenta con ese nombre y moneda" };
      }
      return { error: error.message };
    }

    if (initial_amount !== undefined) {
      const { data: prefsRow } = await supabase
        .from("user_preferences")
        .select("base_currency")
        .eq("user_id", user.id)
        .maybeSingle();
      const baseCurrency = prefsRow?.base_currency ?? "USD";

      // accountUpdates.currency puede ser undefined si no se cambió; leer de la cuenta actualizada
      const accountCurrency = accountUpdates.currency ?? data.currency;
      const openingBase = await resolveOpeningBase(
        initial_amount,
        accountCurrency,
        baseCurrency,
        base_amount,
        exchange_rate,
      );

      const { data: months } = await supabase
        .from("months")
        .select("id")
        .eq("user_id", user.id);

      const openingRows = (months ?? []).map((m) => ({
        month_id: m.id,
        account_id: id,
        opening_amount: initial_amount,
        opening_base_amount: openingBase,
      }));

      if (openingRows.length > 0) {
        await supabase
          .from("opening_balances")
          .upsert(openingRows, { onConflict: "month_id,account_id" });
      }
    }

    return { data: data as Account };
  } catch {
    return { error: "Error al actualizar la cuenta" };
  }
}

// --- DELETE ACCOUNT ---
export async function deleteAccount(id: string): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      if (error.code === "23503") {
        return {
          error:
            "No se puede eliminar: la cuenta tiene transacciones asociadas",
        };
      }
      return { error: error.message };
    }
    return { data: null };
  } catch {
    return { error: "Error al eliminar la cuenta" };
  }
}
