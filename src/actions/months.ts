"use server";

import { createClient } from "@/lib/supabase/server";
import type { Month, OpeningBalance } from "@/types/months";

type ActionResult<T> = { data: T } | { error: string };

function toYearMonthCode(year: number, month: number): number {
  return year * 100 + month;
}

function nextYearMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getMonths(): Promise<ActionResult<Month[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) return { error: error.message };
    return { data: (data ?? []) as Month[] };
  } catch {
    return { error: "Error al obtener meses" };
  }
}

export async function getOrCreateCurrentMonth(): Promise<ActionResult<Month>> {
  const now = new Date();
  return createMonth(now.getFullYear(), now.getMonth() + 1);
}

export async function createNextMonthFromLatest(): Promise<ActionResult<Month>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: latest, error } = await supabase
      .from("months")
      .select("year, month")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!latest) return getOrCreateCurrentMonth();

    const next = nextYearMonth(latest.year, latest.month);
    return createMonth(next.year, next.month);
  } catch {
    return { error: "Error al crear el próximo mes" };
  }
}

export async function createMonth(
  year: number,
  month: number
): Promise<ActionResult<Month>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    if (month < 1 || month > 12) return { error: "Mes inválido" };

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (existing) return { data: existing as Month };

    const { data: created, error: createMonthError } = await supabase
      .from("months")
      .insert({ user_id: userId, year, month })
      .select()
      .single();
    if (createMonthError) return { error: createMonthError.message };

    const newMonth = created as Month;

    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (accountsError) return { error: accountsError.message };

    const activeAccountIds = (accounts ?? []).map((a) => a.id);
    if (activeAccountIds.length === 0) return { data: newMonth };

    const targetCode = toYearMonthCode(year, month);

    const { data: previousMonths, error: prevMonthsError } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", userId)
      .lt("year", year + 1)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (prevMonthsError) return { error: prevMonthsError.message };

    const previousMonth = (previousMonths ?? []).find(
      (m) => toYearMonthCode(m.year, m.month) < targetCode
    );

    const openingByAccount = new Map<
      string,
      { opening_amount: number; opening_base_amount: number }
    >();

    if (previousMonth) {
      const { data: prevOpenings, error: prevOpeningsError } = await supabase
        .from("opening_balances")
        .select("account_id, opening_amount, opening_base_amount")
        .eq("month_id", previousMonth.id);
      if (prevOpeningsError) return { error: prevOpeningsError.message };

      for (const row of prevOpenings ?? []) {
        openingByAccount.set(row.account_id, {
          opening_amount: Number(row.opening_amount),
          opening_base_amount: Number(row.opening_base_amount),
        });
      }

      const { data: prevMovements, error: prevMovementsError } = await supabase
        .from("transaction_amounts")
        .select("account_id, amount, base_amount, transactions!inner(month_id)")
        .eq("transactions.month_id", previousMonth.id);
      if (prevMovementsError) return { error: prevMovementsError.message };

      for (const row of prevMovements ?? []) {
        const current = openingByAccount.get(row.account_id) ?? {
          opening_amount: 0,
          opening_base_amount: 0,
        };
        openingByAccount.set(row.account_id, {
          opening_amount: current.opening_amount + Number(row.amount),
          opening_base_amount:
            current.opening_base_amount + Number(row.base_amount),
        });
      }
    }

    const openingRows = activeAccountIds.map((accountId) => {
      const values = openingByAccount.get(accountId) ?? {
        opening_amount: 0,
        opening_base_amount: 0,
      };
      return {
        month_id: newMonth.id,
        account_id: accountId,
        opening_amount: values.opening_amount,
        opening_base_amount: values.opening_base_amount,
      };
    });

    if (openingRows.length > 0) {
      const { error: openingInsertError } = await supabase
        .from("opening_balances")
        .insert(openingRows);
      if (openingInsertError) return { error: openingInsertError.message };
    }

    return { data: newMonth };
  } catch {
    return { error: "Error al crear mes" };
  }
}

export async function getOpeningBalances(
  monthId: string
): Promise<ActionResult<OpeningBalance[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("opening_balances")
      .select(
        `
        *,
        accounts!inner ( id, user_id, name, currency )
      `
      )
      .eq("month_id", monthId)
      .eq("accounts.user_id", userId)
      .order("created_at", { ascending: true });

    if (error) return { error: error.message };

    const currencyCodes = Array.from(
      new Set(
        (data ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((row: any) => row.accounts?.currency)
          .filter(Boolean)
      )
    );
    const symbolByCode = new Map<string, string>();

    if (currencyCodes.length > 0) {
      const { data: currencyRows } = await supabase
        .from("currencies")
        .select("code, symbol")
        .in("code", currencyCodes);
      for (const row of currencyRows ?? []) {
        symbolByCode.set(row.code, row.symbol);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      month_id: row.month_id,
      account_id: row.account_id,
      opening_amount: Number(row.opening_amount),
      opening_base_amount: Number(row.opening_base_amount),
      created_at: row.created_at,
      account_name: row.accounts?.name ?? "",
      account_currency: row.accounts?.currency ?? "",
      account_currency_symbol:
        symbolByCode.get(row.accounts?.currency ?? "") ??
        row.accounts?.currency ??
        "",
    })) as OpeningBalance[];

    return { data: mapped };
  } catch {
    return { error: "Error al obtener saldos iniciales" };
  }
}
