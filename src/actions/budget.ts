"use server";

import { createClient } from "@/lib/supabase/server";
import {
  ApplyBudgetLineToCalendarMonthsSchema,
  ApplyBudgetLineToSelectedMonthsSchema,
  ApplyBudgetLineToMonthsSchema,
  CreateBudgetNextMonthFromSourceSchema,
  CreateBudgetLineSchema,
  CreateBudgetYearSchema,
  CreateCategorySchema,
  CreateOrUpdateBudgetRecurrenceRuleSchema,
  MaterializeBudgetRecurrenceSchema,
  UpsertBudgetMonthPlanSchema,
  UpdateBudgetLineSchema,
  UpdateCategorySchema,
} from "@/lib/validations/budget.schema";
import { createMonth } from "@/actions/months";
import type {
  BudgetCategory,
  BudgetLine,
  BudgetLineWithPlan,
  BudgetMonthPlan,
  BudgetRecurrenceRule,
  BudgetRecurrenceRuleWithLine,
  BudgetSummaryVsActual,
  BudgetYear,
} from "@/types/budget";

type ActionResult<T> = { data: T } | { error: string };

type MonthLite = {
  id: string;
  year: number;
  month: number;
};

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user.id;
}

function monthCode(year: number, month: number): number {
  return year * 100 + month;
}

function addMonths(
  year: number,
  month: number,
  offset: number
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

function monthDiff(start: MonthLite, end: MonthLite): number {
  return (end.year - start.year) * 12 + (end.month - start.month);
}

async function getMonthForUser(
  userId: string,
  monthId: string
): Promise<ActionResult<MonthLite>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("months")
    .select("id, year, month")
    .eq("user_id", userId)
    .eq("id", monthId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Mes no encontrado" };
  return { data };
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

// --- BUDGET LINES + MONTH PLANS ---
export async function getBudgetLines(
  monthId: string
): Promise<ActionResult<BudgetLineWithPlan[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const month = await getMonthForUser(userId, monthId);
    if ("error" in month) return month;

    const supabase = await createClient();
    const { data: lines, error: linesError } = await supabase
      .from("budget_lines")
      .select(
        `
        id, user_id, category_id, name, display_order, is_active, created_at, updated_at,
        budget_categories!inner(id, name, category_type)
      `
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (linesError) return { error: linesError.message };
    if (!lines || lines.length === 0) return { data: [] };

    const lineIds = lines.map((line) => line.id);
    const { data: plans, error: plansError } = await supabase
      .from("budget_month_plans")
      .select("id, line_id, month_id, planned_amount")
      .eq("month_id", monthId)
      .in("line_id", lineIds);

    if (plansError) return { error: plansError.message };

    const planByLineId = new Map(
      (plans ?? []).map((plan) => [
        plan.line_id,
        {
          id: plan.id,
          month_id: plan.month_id,
          planned_amount: Number(plan.planned_amount),
        },
      ])
    );

    const mapped = lines.map((line) => {
      const categoryRaw = line.budget_categories as
        | {
            id: string;
            name: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            category_type: any;
          }
        | {
            id: string;
            name: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            category_type: any;
          }[];
      const category = Array.isArray(categoryRaw) ? categoryRaw[0] : categoryRaw;
      const typedCategory = category as {
        id: string;
        name: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category_type: any;
      };
      const plan = planByLineId.get(line.id);
      return {
        id: line.id,
        user_id: line.user_id,
        category_id: line.category_id,
        name: line.name,
        display_order: line.display_order,
        is_active: line.is_active,
        created_at: line.created_at,
        updated_at: line.updated_at,
        category_name: typedCategory?.name ?? "Sin categoría",
        category_type: typedCategory?.category_type,
        month_id: monthId,
        plan_id: plan?.id ?? null,
        planned_amount: plan?.planned_amount ?? 0,
      };
    }) as BudgetLineWithPlan[];

    return { data: mapped };
  } catch {
    return { error: "Error al obtener líneas de presupuesto" };
  }
}

export async function createBudgetLine(
  input: unknown
): Promise<ActionResult<BudgetLine>> {
  try {
    const parsed = CreateBudgetLineSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: category, error: categoryError } = await supabase
      .from("budget_categories")
      .select("id")
      .eq("id", parsed.data.category_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (categoryError) return { error: categoryError.message };
    if (!category) return { error: "Categoría no encontrada" };

    const { data, error } = await supabase
      .from("budget_lines")
      .insert({
        user_id: userId,
        category_id: parsed.data.category_id,
        name: parsed.data.name,
        display_order: parsed.data.display_order,
        is_active: parsed.data.is_active,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return { error: "Ya existe una línea con ese nombre en la categoría" };
      return { error: error.message };
    }

    return { data: data as BudgetLine };
  } catch {
    return { error: "Error al crear línea de presupuesto" };
  }
}

export async function updateBudgetLine(
  input: unknown
): Promise<ActionResult<BudgetLine>> {
  try {
    const parsed = UpdateBudgetLineSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { id, ...updates } = parsed.data;

    if (updates.category_id) {
      const { data: category, error: categoryError } = await supabase
        .from("budget_categories")
        .select("id")
        .eq("id", updates.category_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (categoryError) return { error: categoryError.message };
      if (!category) return { error: "Categoría no encontrada" };
    }

    const { data, error } = await supabase
      .from("budget_lines")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return { error: "Ya existe una línea con ese nombre en la categoría" };
      return { error: error.message };
    }
    return { data: data as BudgetLine };
  } catch {
    return { error: "Error al actualizar línea de presupuesto" };
  }
}

export async function deleteBudgetLine(id: string): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("budget_lines")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al eliminar línea de presupuesto" };
  }
}

export async function upsertBudgetMonthPlan(
  input: unknown
): Promise<ActionResult<BudgetMonthPlan>> {
  try {
    const parsed = UpsertBudgetMonthPlanSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("id", parsed.data.line_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lineError) return { error: lineError.message };
    if (!line) return { error: "Línea de presupuesto no encontrada" };

    const month = await getMonthForUser(userId, parsed.data.month_id);
    if ("error" in month) return month;

    const { data, error } = await supabase
      .from("budget_month_plans")
      .upsert(
        {
          line_id: parsed.data.line_id,
          month_id: parsed.data.month_id,
          planned_amount: parsed.data.planned_amount,
        },
        { onConflict: "line_id,month_id" }
      )
      .select()
      .single();

    if (error) return { error: error.message };
    return {
      data: {
        ...data,
        planned_amount: Number(data.planned_amount),
      } as BudgetMonthPlan,
    };
  } catch {
    return { error: "Error al guardar plan mensual" };
  }
}

export async function applyBudgetLineToMonths(
  input: unknown
): Promise<ActionResult<{ affected: number; month_ids: string[] }>> {
  try {
    const parsed = ApplyBudgetLineToMonthsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("id", parsed.data.line_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lineError) return { error: lineError.message };
    if (!line) return { error: "Línea de presupuesto no encontrada" };

    const startMonth = await getMonthForUser(userId, parsed.data.start_month_id);
    if ("error" in startMonth) return startMonth;

    const monthIds: string[] = [];
    for (let i = 0; i < parsed.data.months_count; i += 1) {
      const target = addMonths(startMonth.data.year, startMonth.data.month, i);
      const monthResult = await createMonth(target.year, target.month);
      if ("error" in monthResult) return { error: monthResult.error };
      monthIds.push(monthResult.data.id);
    }

    const rows = monthIds.map((monthId) => ({
      line_id: parsed.data.line_id,
      month_id: monthId,
      planned_amount: parsed.data.planned_amount,
    }));

    const { data, error } = await supabase
      .from("budget_month_plans")
      .upsert(rows, { onConflict: "line_id,month_id" })
      .select("id");
    if (error) return { error: error.message };

    return { data: { affected: data?.length ?? 0, month_ids: monthIds } };
  } catch {
    return { error: "Error al aplicar línea a varios meses" };
  }
}

export async function applyBudgetLineToSelectedMonths(
  input: unknown
): Promise<ActionResult<{ affected: number; month_ids: string[] }>> {
  try {
    const parsed = ApplyBudgetLineToSelectedMonthsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("id", parsed.data.line_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lineError) return { error: lineError.message };
    if (!line) return { error: "Línea de presupuesto no encontrada" };

    const uniqueMonthIds = Array.from(new Set(parsed.data.month_ids));
    if (uniqueMonthIds.length === 0) {
      return { error: "Seleccioná al menos un mes" };
    }

    const { data: validMonths, error: monthError } = await supabase
      .from("months")
      .select("id")
      .eq("user_id", userId)
      .in("id", uniqueMonthIds);
    if (monthError) return { error: monthError.message };

    const validMonthIds = new Set((validMonths ?? []).map((month) => month.id));
    if (validMonthIds.size !== uniqueMonthIds.length) {
      return { error: "Alguno de los meses seleccionados no es válido" };
    }

    const rows = uniqueMonthIds.map((monthId) => ({
      line_id: parsed.data.line_id,
      month_id: monthId,
      planned_amount: parsed.data.planned_amount,
    }));

    const { data, error } = await supabase
      .from("budget_month_plans")
      .upsert(rows, { onConflict: "line_id,month_id" })
      .select("id");
    if (error) return { error: error.message };

    return { data: { affected: data?.length ?? 0, month_ids: uniqueMonthIds } };
  } catch {
    return { error: "Error al aplicar línea a meses seleccionados" };
  }
}

export async function applyBudgetLineToCalendarMonths(
  input: unknown
): Promise<ActionResult<{ affected: number; month_ids: string[] }>> {
  try {
    const parsed = ApplyBudgetLineToCalendarMonthsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("id", parsed.data.line_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lineError) return { error: lineError.message };
    if (!line) return { error: "Línea de presupuesto no encontrada" };

    const monthNumbers = Array.from(new Set(parsed.data.months)).sort(
      (a, b) => a - b,
    );
    const monthIds: string[] = [];
    for (const monthNumber of monthNumbers) {
      const monthResult = await createMonth(parsed.data.year, monthNumber);
      if ("error" in monthResult) return { error: monthResult.error };
      monthIds.push(monthResult.data.id);
    }

    const rows = monthIds.map((monthId) => ({
      line_id: parsed.data.line_id,
      month_id: monthId,
      planned_amount: parsed.data.planned_amount,
    }));

    const { data, error } = await supabase
      .from("budget_month_plans")
      .upsert(rows, { onConflict: "line_id,month_id" })
      .select("id");
    if (error) return { error: error.message };

    return { data: { affected: data?.length ?? 0, month_ids: monthIds } };
  } catch {
    return { error: "Error al aplicar línea a meses de calendario" };
  }
}

export async function createBudgetNextMonthFromSource(
  input: unknown
): Promise<
  ActionResult<{
    month_id: string;
    year: number;
    month: number;
    copied_lines: number;
  }>
> {
  try {
    const parsed = CreateBudgetNextMonthFromSourceSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const sourceMonth = await getMonthForUser(userId, parsed.data.source_month_id);
    if ("error" in sourceMonth) return sourceMonth;

    const targetDate = addMonths(sourceMonth.data.year, sourceMonth.data.month, 1);
    const createdMonth = await createMonth(targetDate.year, targetDate.month);
    if ("error" in createdMonth) return { error: createdMonth.error };

    const supabase = await createClient();
    const entryCategoryIds = Array.from(
      new Set(parsed.data.entries.map((entry) => entry.category_id))
    );

    const { data: categories, error: categoriesError } = await supabase
      .from("budget_categories")
      .select("id, name, display_order")
      .eq("user_id", userId)
      .in("id", entryCategoryIds);
    if (categoriesError) return { error: categoriesError.message };

    const validCategoryIds = new Set((categories ?? []).map((c) => c.id));
    if (validCategoryIds.size !== entryCategoryIds.length) {
      return { error: "Alguna categoría no es válida" };
    }

    const { data: lines, error: linesError } = await supabase
      .from("budget_lines")
      .select("id, category_id, display_order, name")
      .eq("user_id", userId)
      .in("category_id", entryCategoryIds)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (linesError) return { error: linesError.message };

    const primaryLineByCategoryId = new Map<string, string>();
    for (const line of lines ?? []) {
      if (!primaryLineByCategoryId.has(line.category_id)) {
        primaryLineByCategoryId.set(line.category_id, line.id);
      }
    }

    const missingCategories = (categories ?? []).filter(
      (category) => !primaryLineByCategoryId.has(category.id)
    );
    if (missingCategories.length > 0) {
      const { error: insertLinesError } = await supabase
        .from("budget_lines")
        .insert(
          missingCategories.map((category) => ({
            user_id: userId,
            category_id: category.id,
            name: category.name,
            display_order: category.display_order ?? 0,
            is_active: true,
          }))
        );
      if (insertLinesError) return { error: insertLinesError.message };

      const { data: refreshedLines, error: refreshedLinesError } = await supabase
        .from("budget_lines")
        .select("id, category_id, display_order, name")
        .eq("user_id", userId)
        .in("category_id", entryCategoryIds)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (refreshedLinesError) return { error: refreshedLinesError.message };

      primaryLineByCategoryId.clear();
      for (const line of refreshedLines ?? []) {
        if (!primaryLineByCategoryId.has(line.category_id)) {
          primaryLineByCategoryId.set(line.category_id, line.id);
        }
      }
    }

    const { data: allUserLines, error: allLinesError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("user_id", userId);
    if (allLinesError) return { error: allLinesError.message };

    const allUserLineIds = (allUserLines ?? []).map((line) => line.id);
    if (allUserLineIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("budget_month_plans")
        .delete()
        .eq("month_id", createdMonth.data.id)
        .in("line_id", allUserLineIds);
      if (deleteError) return { error: deleteError.message };
    }

    const rowsToInsert = parsed.data.entries
      .map((entry) => ({
        line_id: primaryLineByCategoryId.get(entry.category_id),
        month_id: createdMonth.data.id,
        planned_amount: entry.planned_amount,
      }))
      .filter((row) => !!row.line_id) as {
      line_id: string;
      month_id: string;
      planned_amount: number;
    }[];

    if (rowsToInsert.length > 0) {
      const { error: insertPlansError } = await supabase
        .from("budget_month_plans")
        .insert(rowsToInsert);
      if (insertPlansError) return { error: insertPlansError.message };
    }

    return {
      data: {
        month_id: createdMonth.data.id,
        year: createdMonth.data.year,
        month: createdMonth.data.month,
        copied_lines: rowsToInsert.length,
      },
    };
  } catch {
    return { error: "Error al crear presupuesto del mes siguiente" };
  }
}

// --- RECURRENCE RULES ---
export async function getBudgetRecurrenceRules(
  lineId?: string
): Promise<ActionResult<BudgetRecurrenceRuleWithLine[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    let query = supabase
      .from("budget_recurrence_rules")
      .select(
        `
        id, line_id, start_month_id, end_month_id, mode, amount, is_active, created_at, updated_at,
        budget_lines!inner (
          id, user_id, name,
          budget_categories!inner ( name )
        )
      `
      )
      .eq("budget_lines.user_id", userId)
      .order("created_at", { ascending: false });

    if (lineId) query = query.eq("line_id", lineId);

    const { data, error } = await query;
    if (error) return { error: error.message };

    const mapped = (data ?? []).map((row) => {
      const lineRaw = row.budget_lines as
        | {
            name: string;
            budget_categories: { name: string } | { name: string }[];
          }
        | {
            name: string;
            budget_categories: { name: string } | { name: string }[];
          }[];
      const line = Array.isArray(lineRaw) ? lineRaw[0] : lineRaw;
      const categoryRaw = line?.budget_categories;
      const category = Array.isArray(categoryRaw) ? categoryRaw[0] : categoryRaw;
      const typedLine = line as {
        name: string;
      };
      const typedCategory = category as {
        name: string;
      };
      return {
        id: row.id,
        line_id: row.line_id,
        start_month_id: row.start_month_id,
        end_month_id: row.end_month_id,
        mode: row.mode,
        amount: Number(row.amount),
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        line_name: typedLine?.name ?? "",
        category_name: typedCategory?.name ?? "",
      };
    }) as BudgetRecurrenceRuleWithLine[];

    return { data: mapped };
  } catch {
    return { error: "Error al obtener reglas recurrentes" };
  }
}

export async function createOrUpdateBudgetRecurrenceRule(
  input: unknown
): Promise<ActionResult<BudgetRecurrenceRule>> {
  try {
    const parsed = CreateOrUpdateBudgetRecurrenceRuleSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: line, error: lineError } = await supabase
      .from("budget_lines")
      .select("id")
      .eq("id", parsed.data.line_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lineError) return { error: lineError.message };
    if (!line) return { error: "Línea de presupuesto no encontrada" };

    const startMonth = await getMonthForUser(userId, parsed.data.start_month_id);
    if ("error" in startMonth) return startMonth;

    let endMonthCode: number | null = null;
    if (parsed.data.end_month_id) {
      const endMonth = await getMonthForUser(userId, parsed.data.end_month_id);
      if ("error" in endMonth) return endMonth;
      endMonthCode = monthCode(endMonth.data.year, endMonth.data.month);
      const startCode = monthCode(startMonth.data.year, startMonth.data.month);
      if (endMonthCode < startCode) {
        return { error: "El mes final no puede ser anterior al mes inicial" };
      }
    }

    if (parsed.data.id) {
      const { data: existing, error: existingError } = await supabase
        .from("budget_recurrence_rules")
        .select("id, line_id")
        .eq("id", parsed.data.id)
        .maybeSingle();
      if (existingError) return { error: existingError.message };
      if (!existing) return { error: "Regla no encontrada" };
      if (existing.line_id !== parsed.data.line_id) {
        return {
          error:
            "La regla pertenece a otra línea. No se puede cambiar la línea asociada",
        };
      }
    }

    const payload = {
      line_id: parsed.data.line_id,
      start_month_id: parsed.data.start_month_id,
      end_month_id: parsed.data.end_month_id,
      mode: parsed.data.mode,
      amount: parsed.data.amount,
      is_active: parsed.data.is_active,
    };

    const result = parsed.data.id
      ? await supabase
          .from("budget_recurrence_rules")
          .update(payload)
          .eq("id", parsed.data.id)
          .select()
          .single()
      : await supabase
          .from("budget_recurrence_rules")
          .insert(payload)
          .select()
          .single();

    if (result.error) return { error: result.error.message };

    return {
      data: {
        ...(result.data as BudgetRecurrenceRule),
        amount: Number(result.data.amount),
      },
    };
  } catch {
    return { error: "Error al guardar regla recurrente" };
  }
}

export async function deleteBudgetRecurrenceRule(
  id: string
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const { data: existing, error: existingError } = await supabase
      .from("budget_recurrence_rules")
      .select(
        `
        id,
        budget_lines!inner ( user_id )
      `
      )
      .eq("id", id)
      .eq("budget_lines.user_id", userId)
      .maybeSingle();
    if (existingError) return { error: existingError.message };
    if (!existing) return { error: "Regla no encontrada" };

    const { error } = await supabase
      .from("budget_recurrence_rules")
      .delete()
      .eq("id", id);
    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al eliminar regla recurrente" };
  }
}

export async function materializeBudgetRecurrenceForRange(
  input: unknown
): Promise<ActionResult<{ affected: number; month_ids: string[] }>> {
  try {
    const parsed = MaterializeBudgetRecurrenceSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const supabase = await createClient();

    const startMonth = await getMonthForUser(userId, parsed.data.start_month_id);
    if ("error" in startMonth) return startMonth;
    const endMonth = await getMonthForUser(userId, parsed.data.end_month_id);
    if ("error" in endMonth) return endMonth;

    if (monthDiff(startMonth.data, endMonth.data) < 0) {
      return { error: "El rango de meses es inválido" };
    }

    const totalMonths = monthDiff(startMonth.data, endMonth.data) + 1;
    const materializedMonths: MonthLite[] = [];
    for (let i = 0; i < totalMonths; i += 1) {
      const target = addMonths(startMonth.data.year, startMonth.data.month, i);
      const created = await createMonth(target.year, target.month);
      if ("error" in created) return { error: created.error };
      materializedMonths.push({
        id: created.data.id,
        year: created.data.year,
        month: created.data.month,
      });
    }

    const targetMonthIds = materializedMonths.map((m) => m.id);
    const targetCodeByMonthId = new Map(
      materializedMonths.map((m) => [m.id, monthCode(m.year, m.month)])
    );

    const { data: rules, error: rulesError } = await supabase
      .from("budget_recurrence_rules")
      .select(
        `
        id, line_id, start_month_id, end_month_id, mode, amount, is_active, created_at,
        budget_lines!inner ( user_id )
      `
      )
      .eq("is_active", true)
      .eq("budget_lines.user_id", userId);
    if (rulesError) return { error: rulesError.message };
    if (!rules || rules.length === 0) {
      return { data: { affected: 0, month_ids: targetMonthIds } };
    }

    const ruleMonthIds = Array.from(
      new Set(
        rules
          .flatMap((rule) => [rule.start_month_id, rule.end_month_id].filter(Boolean))
          .map((id) => id as string)
      )
    );

    const { data: ruleMonths, error: ruleMonthsError } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", userId)
      .in("id", ruleMonthIds);
    if (ruleMonthsError) return { error: ruleMonthsError.message };

    const ruleCodeByMonthId = new Map(
      (ruleMonths ?? []).map((month) => [month.id, monthCode(month.year, month.month)])
    );

    const lineIds = Array.from(new Set(rules.map((rule) => rule.line_id)));
    const { data: existingPlans, error: existingPlansError } = await supabase
      .from("budget_month_plans")
      .select("line_id, month_id, planned_amount")
      .in("line_id", lineIds)
      .in("month_id", targetMonthIds);
    if (existingPlansError) return { error: existingPlansError.message };

    const existingAmount = new Map(
      (existingPlans ?? []).map((plan) => [
        `${plan.line_id}:${plan.month_id}`,
        Number(plan.planned_amount),
      ])
    );

    const workingAmount = new Map<string, number>();
    const touched = new Set<string>();

    const sortedRules = [...rules].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );

    for (const rule of sortedRules) {
      const startCode = ruleCodeByMonthId.get(rule.start_month_id);
      if (!startCode) continue;
      const endCode = rule.end_month_id
        ? ruleCodeByMonthId.get(rule.end_month_id) ?? Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY;

      for (const monthId of targetMonthIds) {
        const targetCode = targetCodeByMonthId.get(monthId);
        if (!targetCode) continue;
        if (targetCode < startCode || targetCode > endCode) continue;

        const key = `${rule.line_id}:${monthId}`;
        const currentValue =
          workingAmount.get(key) ?? existingAmount.get(key) ?? 0;
        const nextValue =
          rule.mode === "set"
            ? Number(rule.amount)
            : currentValue + Number(rule.amount);
        workingAmount.set(key, nextValue);
        touched.add(key);
      }
    }

    if (touched.size === 0) {
      return { data: { affected: 0, month_ids: targetMonthIds } };
    }

    const rows = Array.from(touched).map((key) => {
      const [line_id, month_id] = key.split(":");
      return {
        line_id,
        month_id,
        planned_amount: workingAmount.get(key) ?? existingAmount.get(key) ?? 0,
      };
    });

    const { data: upserted, error: upsertError } = await supabase
      .from("budget_month_plans")
      .upsert(rows, { onConflict: "line_id,month_id" })
      .select("id");
    if (upsertError) return { error: upsertError.message };

    return {
      data: {
        affected: upserted?.length ?? 0,
        month_ids: targetMonthIds,
      },
    };
  } catch {
    return { error: "Error al materializar reglas recurrentes" };
  }
}

// --- SUMMARY: PLAN VS REAL ---
export async function getBudgetSummaryVsActual(
  monthId: string
): Promise<ActionResult<BudgetSummaryVsActual>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    const month = await getMonthForUser(userId, monthId);
    if ("error" in month) return month;

    const supabase = await createClient();
    const { data: categories, error: categoriesError } = await supabase
      .from("budget_categories")
      .select("id, name, category_type, display_order")
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (categoriesError) return { error: categoriesError.message };

    const { data: lines, error: linesError } = await supabase
      .from("budget_lines")
      .select("id, category_id")
      .eq("user_id", userId);
    if (linesError) return { error: linesError.message };

    const lineIds = (lines ?? []).map((line) => line.id);
    const lineToCategory = new Map(
      (lines ?? []).map((line) => [line.id, line.category_id])
    );

    const plannedByCategory = new Map<string, number>();
    if (lineIds.length > 0) {
      const { data: plans, error: plansError } = await supabase
        .from("budget_month_plans")
        .select("line_id, planned_amount")
        .eq("month_id", monthId)
        .in("line_id", lineIds);
      if (plansError) return { error: plansError.message };

      for (const plan of plans ?? []) {
        const categoryId = lineToCategory.get(plan.line_id);
        if (!categoryId) continue;
        const current = plannedByCategory.get(categoryId) ?? 0;
        plannedByCategory.set(categoryId, current + Number(plan.planned_amount));
      }
    }

    const { data: txRows, error: txError } = await supabase
      .from("transactions")
      .select(
        `
        category_id,
        transaction_amounts ( base_amount )
      `
      )
      .eq("user_id", userId)
      .eq("month_id", monthId)
      .not("category_id", "is", null)
      .neq("transaction_type", "transfer");
    if (txError) return { error: txError.message };

    const categoryTypeById = new Map(
      (categories ?? []).map((category) => [category.id, category.category_type])
    );
    const actualByCategory = new Map<string, number>();
    for (const row of txRows ?? []) {
      const categoryId = row.category_id as string | null;
      if (!categoryId) continue;
      const sumBase = (row.transaction_amounts ?? []).reduce(
        (acc, amountRow) => acc + Number(amountRow.base_amount),
        0
      );
      const categoryType = categoryTypeById.get(categoryId);
      const normalized =
        categoryType === "income" ? sumBase : Math.abs(sumBase);
      const current = actualByCategory.get(categoryId) ?? 0;
      actualByCategory.set(categoryId, current + normalized);
    }

    const categorySummary = (categories ?? []).map((category) => {
      const planned = plannedByCategory.get(category.id) ?? 0;
      const actual = actualByCategory.get(category.id) ?? 0;
      return {
        category_id: category.id,
        category_name: category.name,
        category_type: category.category_type,
        planned_amount: planned,
        actual_amount: actual,
        variance: planned - actual,
      };
    });

    const totals = categorySummary.reduce(
      (acc, category) => ({
        planned: acc.planned + category.planned_amount,
        actual: acc.actual + category.actual_amount,
        variance: acc.variance + category.variance,
      }),
      { planned: 0, actual: 0, variance: 0 }
    );

    return {
      data: {
        totals,
        categories: categorySummary,
      },
    };
  } catch {
    return { error: "Error al obtener resumen plan vs real" };
  }
}
