"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateBudgetYearSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
} from "@/lib/validations/budget.schema";
import type { BudgetYear, BudgetCategory } from "@/types/budget";

type ActionResult<T> = { data: T } | { error: string };

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user.id;
}

// --- SEED: solo user_preferences para usuarios existentes (no sobrescribe si ya existen) ---
export async function ensureBudgetSeed(): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) return { data: null };

    const { error } = await supabase.from("user_preferences").insert({
      user_id: userId,
      base_currency: "USD",
      fx_source: "frankfurter",
    });

    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al cargar preferencias" };
  }
}

// --- BUDGET YEARS ---
export async function getBudgetYears(): Promise<ActionResult<BudgetYear[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_years")
      .select("*")
      .eq("user_id", userId)
      .order("year", { ascending: false });

    if (error) return { error: error.message };
    return { data: (data ?? []) as BudgetYear[] };
  } catch {
    return { error: "Error al obtener los años" };
  }
}

export async function getOrCreateBudgetYear(
  year: number
): Promise<ActionResult<BudgetYear>> {
  try {
    const parsed = CreateBudgetYearSchema.safeParse({ year });
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "Año inválido" };

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("budget_years")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .maybeSingle();

    if (existing) return { data: existing as BudgetYear };

    const { data: created, error } = await supabase
      .from("budget_years")
      .insert({ user_id: userId, year })
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: created as BudgetYear };
  } catch {
    return { error: "Error al crear el año" };
  }
}

// --- BUDGET CATEGORIES (solo categorías, sin subcategorías) ---
export async function getBudgetCategories(): Promise<
  ActionResult<BudgetCategory[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_categories")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return { error: error.message };
    return { data: (data ?? []) as BudgetCategory[] };
  } catch {
    return { error: "Error al obtener las categorías" };
  }
}

export async function createCategory(
  input: unknown
): Promise<ActionResult<BudgetCategory>> {
  try {
    const parsed = CreateCategorySchema.safeParse(input);
    if (!parsed.success)
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_categories")
      .insert({
        user_id: userId,
        category_type: parsed.data.category_type,
        name: parsed.data.name,
        monthly_amount: parsed.data.monthly_amount,
        display_order: parsed.data.display_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return { error: "Ya existe una categoría con ese nombre" };
      return { error: error.message };
    }
    return { data: data as BudgetCategory };
  } catch {
    return { error: "Error al crear la categoría" };
  }
}

export async function updateCategory(
  input: unknown
): Promise<ActionResult<BudgetCategory>> {
  try {
    const parsed = UpdateCategorySchema.safeParse(input);
    if (!parsed.success)
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const { id, ...updates } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_categories")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return { error: "Ya existe una categoría con ese nombre" };
      return { error: error.message };
    }
    return { data: data as BudgetCategory };
  } catch {
    return { error: "Error al actualizar la categoría" };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_categories")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al eliminar la categoría" };
  }
}
