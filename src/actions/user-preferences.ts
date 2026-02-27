"use server";

import { createClient } from "@/lib/supabase/server";

export interface UserPreferences {
  base_currency: string;
  fx_source: string;
}

type ActionResult<T> = { data: T } | { error: string };

export async function getUserPreferences(): Promise<
  ActionResult<UserPreferences>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("user_preferences")
      .select("base_currency, fx_source")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { error: error.message };
    return {
      data: {
        base_currency: data?.base_currency ?? "USD",
        fx_source: data?.fx_source ?? "frankfurter",
      },
    };
  } catch {
    return { error: "Error al obtener preferencias" };
  }
}

export async function updateUserPreferences(
  input: { base_currency?: string; fx_source?: string }
): Promise<ActionResult<UserPreferences>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const payload: Record<string, string> = {};
    if (input.base_currency != null) payload.base_currency = input.base_currency;
    if (input.fx_source != null) payload.fx_source = input.fx_source;

    if (Object.keys(payload).length === 0) {
      return getUserPreferences();
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .update(payload)
      .eq("user_id", user.id)
      .select("base_currency, fx_source")
      .single();

    if (error) return { error: error.message };
    return {
      data: {
        base_currency: data.base_currency,
        fx_source: data.fx_source,
      },
    };
  } catch {
    return { error: "Error al actualizar preferencias" };
  }
}
