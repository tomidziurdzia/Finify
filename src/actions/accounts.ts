"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateAccountSchema,
  UpdateAccountSchema,
} from "@/lib/validations/account.schema";
import type { Account, Currency } from "@/types/accounts";

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

// --- CREATE ACCOUNT ---
export async function createAccount(
  input: unknown
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

    const { data, error } = await supabase
      .from("accounts")
      .insert({ ...parsed.data, user_id: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "Ya existe una cuenta con ese nombre y moneda" };
      }
      return { error: error.message };
    }
    return { data: data as Account };
  } catch {
    return { error: "Error al crear la cuenta" };
  }
}

// --- UPDATE ACCOUNT ---
export async function updateAccount(
  input: unknown
): Promise<ActionResult<Account>> {
  try {
    const parsed = UpdateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const { id, ...updates } = parsed.data;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("accounts")
      .update(updates)
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
    return { data: data as Account };
  } catch {
    return { error: "Error al actualizar la cuenta" };
  }
}

// --- DELETE ACCOUNT ---
export async function deleteAccount(
  id: string
): Promise<ActionResult<null>> {
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
