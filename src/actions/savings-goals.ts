"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateSavingsGoalSchema,
  UpdateSavingsGoalSchema,
} from "@/lib/validations/savings-goals.schema";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";

type ActionResult<T> = { data: T } | { error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGoal(row: any): SavingsGoalWithRelations {
  const target = Number(row.target_amount);
  const current = Number(row.current_amount);
  return {
    ...row,
    target_amount: target,
    current_amount: current,
    account_name: row.accounts?.name ?? null,
    currency_symbol: row.currencies?.symbol ?? row.currency,
    progress_pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    accounts: undefined,
    currencies: undefined,
  };
}

// --- GET ALL GOALS ---
export async function getSavingsGoals(): Promise<
  ActionResult<SavingsGoalWithRelations[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("savings_goals")
      .select(
        `
        *,
        accounts ( name ),
        currencies!currency ( symbol )
      `
      )
      .eq("user_id", user.id)
      .order("is_completed", { ascending: true })
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) return { error: error.message };

    return { data: (data ?? []).map(mapGoal) };
  } catch (e) {
    console.error("getSavingsGoals:", e);
    return { error: "Error al obtener las metas de ahorro" };
  }
}

// --- CREATE GOAL ---
export async function createSavingsGoal(
  input: unknown
): Promise<ActionResult<SavingsGoalWithRelations>> {
  try {
    const parsed = CreateSavingsGoalSchema.safeParse(input);
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
      .from("savings_goals")
      .insert({ ...parsed.data, user_id: user.id })
      .select(
        `
        *,
        accounts ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (error) return { error: error.message };

    return { data: mapGoal(data) };
  } catch (e) {
    console.error("createSavingsGoal:", e);
    return { error: "Error al crear la meta de ahorro" };
  }
}

// --- UPDATE GOAL ---
export async function updateSavingsGoal(
  input: unknown
): Promise<ActionResult<SavingsGoalWithRelations>> {
  try {
    const parsed = UpdateSavingsGoalSchema.safeParse(input);
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
      .from("savings_goals")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        `
        *,
        accounts ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (error) return { error: error.message };

    return { data: mapGoal(data) };
  } catch (e) {
    console.error("updateSavingsGoal:", e);
    return { error: "Error al actualizar la meta de ahorro" };
  }
}

// --- DELETE GOAL ---
export async function deleteSavingsGoal(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { error } = await supabase
      .from("savings_goals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    return { data: null };
  } catch (e) {
    console.error("deleteSavingsGoal:", e);
    return { error: "Error al eliminar la meta de ahorro" };
  }
}

// --- RECALCULATE GOAL PROGRESS ---
// Sums all transactions linked to this goal
export async function recalculateGoalProgress(
  goalId: string
): Promise<ActionResult<SavingsGoalWithRelations>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    // Sum base_amount of all transactions linked to this goal
    const { data: txRows, error: txError } = await supabase
      .from("transactions")
      .select("transaction_amounts ( base_amount )")
      .eq("user_id", user.id)
      .eq("savings_goal_id", goalId)
      .is("deleted_at", null);

    if (txError) return { error: txError.message };

    let total = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tx of txRows ?? []) {
      const lines = Array.isArray(tx.transaction_amounts)
        ? tx.transaction_amounts
        : tx.transaction_amounts
          ? [tx.transaction_amounts]
          : [];
      for (const line of lines) {
        total += Math.abs(Number(line.base_amount ?? 0));
      }
    }

    // Update the goal's current_amount
    const { data: updated, error: updateError } = await supabase
      .from("savings_goals")
      .update({
        current_amount: total,
        is_completed: false, // Will be determined below
        updated_at: new Date().toISOString(),
      })
      .eq("id", goalId)
      .eq("user_id", user.id)
      .select(
        `
        *,
        accounts ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (updateError) return { error: updateError.message };

    const goal = mapGoal(updated);

    // Mark as completed if reached target
    if (goal.current_amount >= goal.target_amount) {
      await supabase
        .from("savings_goals")
        .update({ is_completed: true })
        .eq("id", goalId)
        .eq("user_id", user.id);
      goal.is_completed = true;
    }

    return { data: goal };
  } catch (e) {
    console.error("recalculateGoalProgress:", e);
    return { error: "Error al recalcular el progreso" };
  }
}
