"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateTransactionSchema,
  CreateTransferSchema,
  UpdateTransactionSchema,
} from "@/lib/validations/transaction.schema";
import type { Transaction, TransactionWithRelations } from "@/types/transactions";
import { lastDayOfMonth, format } from "date-fns";

type ActionResult<T> = { data: T } | { error: string };

// --- GET TRANSACTIONS (by month/year) ---
export async function getTransactions(
  year: number,
  month: number
): Promise<ActionResult<TransactionWithRelations[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = format(
      lastDayOfMonth(new Date(year, month - 1)),
      "yyyy-MM-dd"
    );

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        accounts ( name ),
        budget_categories ( name ),
        currencies!original_currency ( symbol )
      `
      )
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      account_id: row.account_id,
      category_id: row.category_id,
      transaction_type: row.transaction_type,
      date: row.date,
      description: row.description,
      amount: Number(row.amount),
      original_currency: row.original_currency,
      exchange_rate: Number(row.exchange_rate),
      base_amount: Number(row.base_amount),
      transfer_linked_id: row.transfer_linked_id,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      account_name: row.accounts?.name ?? "",
      account_currency_symbol: row.currencies?.symbol ?? row.original_currency,
      category_name: row.budget_categories?.name ?? null,
    })) as TransactionWithRelations[];

    return { data: mapped };
  } catch {
    return { error: "Error al obtener las transacciones" };
  }
}

// --- CREATE TRANSACTION ---
export async function createTransaction(
  input: unknown
): Promise<ActionResult<Transaction>> {
  try {
    const parsed = CreateTransactionSchema.safeParse(input);
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

    // Lookup account to get original_currency
    const { data: account } = await supabase
      .from("accounts")
      .select("currency")
      .eq("id", parsed.data.account_id)
      .eq("user_id", user.id)
      .single();

    if (!account) return { error: "Cuenta no encontrada" };

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: parsed.data.account_id,
        category_id: parsed.data.category_id,
        transaction_type: parsed.data.transaction_type,
        date: parsed.data.date,
        description: parsed.data.description,
        amount: parsed.data.amount,
        original_currency: account.currency,
        exchange_rate: parsed.data.exchange_rate,
        base_amount: parsed.data.base_amount,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23503") {
        return { error: "Cuenta o categoría no encontrada" };
      }
      return { error: error.message };
    }
    return { data: data as Transaction };
  } catch {
    return { error: "Error al crear la transacción" };
  }
}

// --- CREATE TRANSFER (two linked rows) ---
export async function createTransfer(
  input: unknown
): Promise<ActionResult<Transaction>> {
  try {
    const parsed = CreateTransferSchema.safeParse(input);
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

    // Lookup both accounts
    const { data: sourceAccount } = await supabase
      .from("accounts")
      .select("currency")
      .eq("id", parsed.data.source_account_id)
      .eq("user_id", user.id)
      .single();

    if (!sourceAccount) return { error: "Cuenta origen no encontrada" };

    const { data: destAccount } = await supabase
      .from("accounts")
      .select("currency")
      .eq("id", parsed.data.destination_account_id)
      .eq("user_id", user.id)
      .single();

    if (!destAccount) return { error: "Cuenta destino no encontrada" };

    // Step 1: Insert source row (debit side)
    const { data: sourceRow, error: sourceError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: parsed.data.source_account_id,
        category_id: null,
        transaction_type: "transfer" as const,
        date: parsed.data.date,
        description: parsed.data.description,
        amount: parsed.data.amount,
        original_currency: sourceAccount.currency,
        exchange_rate: parsed.data.exchange_rate,
        base_amount: parsed.data.base_amount,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (sourceError) return { error: sourceError.message };

    // Step 2: Insert destination row (credit side), linking back to source
    const { data: destRow, error: destError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: parsed.data.destination_account_id,
        category_id: null,
        transaction_type: "transfer" as const,
        date: parsed.data.date,
        description: parsed.data.description,
        amount: parsed.data.amount,
        original_currency: destAccount.currency,
        exchange_rate: parsed.data.exchange_rate,
        base_amount: parsed.data.base_amount,
        notes: parsed.data.notes,
        transfer_linked_id: sourceRow.id,
      })
      .select()
      .single();

    if (destError) {
      // Cleanup: delete the source row if destination insert fails
      await supabase
        .from("transactions")
        .delete()
        .eq("id", sourceRow.id);
      return { error: destError.message };
    }

    // Step 3: Update source row to link back to destination
    await supabase
      .from("transactions")
      .update({ transfer_linked_id: destRow.id })
      .eq("id", sourceRow.id);

    return { data: sourceRow as Transaction };
  } catch {
    return { error: "Error al crear la transferencia" };
  }
}

// --- UPDATE TRANSACTION ---
export async function updateTransaction(
  input: unknown
): Promise<ActionResult<Transaction>> {
  try {
    const parsed = UpdateTransactionSchema.safeParse(input);
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

    // Fetch existing to check if transfer
    const { data: existing } = await supabase
      .from("transactions")
      .select("transaction_type, transfer_linked_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) return { error: "Transacción no encontrada" };

    // Update main row
    const { data, error } = await supabase
      .from("transactions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return { error: error.message };

    // If transfer, also update the linked row (shared fields only)
    if (
      existing.transaction_type === "transfer" &&
      existing.transfer_linked_id
    ) {
      const { category_id: _cat, ...sharedUpdates } = updates;
      await supabase
        .from("transactions")
        .update(sharedUpdates)
        .eq("id", existing.transfer_linked_id)
        .eq("user_id", user.id);
    }

    return { data: data as Transaction };
  } catch {
    return { error: "Error al actualizar la transacción" };
  }
}

// --- DELETE TRANSACTION ---
export async function deleteTransaction(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    // Fetch existing to check if transfer
    const { data: existing } = await supabase
      .from("transactions")
      .select("transaction_type, transfer_linked_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) return { error: "Transacción no encontrada" };

    if (
      existing.transaction_type === "transfer" &&
      existing.transfer_linked_id
    ) {
      // Clear linked references first to avoid FK issues
      await supabase
        .from("transactions")
        .update({ transfer_linked_id: null })
        .in("id", [id, existing.transfer_linked_id]);

      // Delete both rows
      const { error } = await supabase
        .from("transactions")
        .delete()
        .in("id", [id, existing.transfer_linked_id]);

      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) return { error: error.message };
    }

    return { data: null };
  } catch {
    return { error: "Error al eliminar la transacción" };
  }
}
