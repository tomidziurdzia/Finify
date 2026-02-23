"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateAccountSchema,
  UpdateAccountSchema,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "@/lib/validations/account.schema";

export async function getAccounts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return { error: error.message };
  return { data };
}

export async function createAccount(input: CreateAccountInput) {
  const parsed = CreateAccountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      account_type: parsed.data.account_type,
      currency: parsed.data.currency,
      notes: parsed.data.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una cuenta con ese nombre" };
    return { error: error.message };
  }
  return { data };
}

export async function updateAccount(input: UpdateAccountInput) {
  const parsed = UpdateAccountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { id, ...updates } = parsed.data;

  const { data, error } = await supabase
    .from("accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una cuenta con ese nombre" };
    return { error: error.message };
  }
  return { data };
}

export async function deleteAccount(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23503")
      return { error: "No se puede eliminar: hay transacciones vinculadas" };
    return { error: error.message };
  }
  return { data: true };
}

export async function getCurrencies() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .order("code", { ascending: true });

  if (error) return { error: error.message };
  return { data };
}
