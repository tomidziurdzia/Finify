"use server";

import { createClient } from "@/lib/supabase/server";
import {
  RecordDebtPaymentSchema,
  RecordDebtAdjustmentSchema,
} from "@/lib/validations/debt-activity.schema";
import { createTransaction } from "@/actions/transactions";
import { getDebtCurrentBalance, upsertNwSnapshot } from "@/actions/net-worth";
import type { DebtActivity } from "@/types/net-worth";

type ActionResult<T> = { data: T } | { error: string };

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Record a debt payment                                               */
/* ------------------------------------------------------------------ */

export async function recordDebtPayment(
  input: unknown
): Promise<ActionResult<DebtActivity>> {
  try {
    const parsed = RecordDebtPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { nw_item_id, date, amount, amount_base, account_id, category_id, description } =
      parsed.data;

    // Verify the nw_item belongs to this user and is a liability
    const { data: nwItem, error: nwError } = await supabase
      .from("nw_items")
      .select("id, currency")
      .eq("id", nw_item_id)
      .eq("user_id", userId)
      .eq("side", "liability")
      .single();

    if (nwError || !nwItem) return { error: "Deuda no encontrada" };

    // Create expense transaction for the payment
    const txResult = await createTransaction({
      date,
      transaction_type: "expense",
      category_id,
      description,
      amounts: [
        {
          account_id,
          amount,
          exchange_rate: amount_base != null && amount !== 0 ? amount_base / amount : 1,
          base_amount: amount_base ?? amount,
        },
      ],
    });

    if ("error" in txResult) return { error: txResult.error };

    // Insert debt activity
    const { data: activity, error: activityError } = await supabase
      .from("debt_activities")
      .insert({
        nw_item_id,
        transaction_id: txResult.data.id,
        activity_type: "payment",
        date,
        amount,
        amount_base,
        description,
      })
      .select()
      .single();

    if (activityError) return { error: activityError.message };

    // Update debt balance snapshot
    const parsedDate = new Date(`${date}T00:00:00`);
    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth() + 1;

    const currentBalance = await getDebtCurrentBalance(nw_item_id, year, month);
    const newBalance = Math.max(0, currentBalance - amount);

    const newAmountBase =
      amount_base != null && amount !== 0
        ? Math.max(0, (currentBalance - amount) * (amount_base / amount))
        : null;

    await upsertNwSnapshot({
      nw_item_id,
      year,
      month,
      amount: newBalance,
      amount_base: newAmountBase,
    });

    return { data: activity as DebtActivity };
  } catch (e) {
    console.error("recordDebtPayment:", e);
    return { error: "Error al registrar el pago" };
  }
}

/* ------------------------------------------------------------------ */
/* Record a debt adjustment (interest or manual adjustment)            */
/* ------------------------------------------------------------------ */

export async function recordDebtAdjustment(
  input: unknown
): Promise<ActionResult<DebtActivity>> {
  try {
    const parsed = RecordDebtAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { nw_item_id, date, amount, amount_base, activity_type, description } =
      parsed.data;

    // Verify the nw_item belongs to this user and is a liability
    const { data: nwItem, error: nwError } = await supabase
      .from("nw_items")
      .select("id")
      .eq("id", nw_item_id)
      .eq("user_id", userId)
      .eq("side", "liability")
      .single();

    if (nwError || !nwItem) return { error: "Deuda no encontrada" };

    // Insert debt activity (no transaction - interest/adjustments don't move bank money)
    const { data: activity, error: activityError } = await supabase
      .from("debt_activities")
      .insert({
        nw_item_id,
        transaction_id: null,
        activity_type,
        date,
        amount,
        amount_base,
        description: description || null,
      })
      .select()
      .single();

    if (activityError) return { error: activityError.message };

    // Update debt balance snapshot (interest increases the balance)
    const parsedDate = new Date(`${date}T00:00:00`);
    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth() + 1;

    const currentBalance = await getDebtCurrentBalance(nw_item_id, year, month);
    const newBalance = currentBalance + amount;

    await upsertNwSnapshot({
      nw_item_id,
      year,
      month,
      amount: newBalance,
      amount_base: amount_base != null ? newBalance * (amount_base / amount) : null,
    });

    return { data: activity as DebtActivity };
  } catch (e) {
    console.error("recordDebtAdjustment:", e);
    return { error: "Error al registrar el ajuste" };
  }
}

/* ------------------------------------------------------------------ */
/* Get debt activities (payment history)                               */
/* ------------------------------------------------------------------ */

export async function getDebtActivities(
  nwItemId: string
): Promise<ActionResult<DebtActivity[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // Verify item belongs to user
    const { data: nwItem, error: nwError } = await supabase
      .from("nw_items")
      .select("id")
      .eq("id", nwItemId)
      .eq("user_id", userId)
      .single();

    if (nwError || !nwItem) return { error: "Deuda no encontrada" };

    const { data: activities, error } = await supabase
      .from("debt_activities")
      .select("*")
      .eq("nw_item_id", nwItemId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };

    const mapped: DebtActivity[] = (activities ?? []).map((a) => ({
      id: a.id,
      nw_item_id: a.nw_item_id,
      transaction_id: a.transaction_id,
      activity_type: a.activity_type,
      date: a.date,
      amount: Number(a.amount),
      amount_base: a.amount_base != null ? Number(a.amount_base) : null,
      description: a.description,
      created_at: a.created_at,
    }));

    return { data: mapped };
  } catch (e) {
    console.error("getDebtActivities:", e);
    return { error: "Error al obtener historial" };
  }
}
