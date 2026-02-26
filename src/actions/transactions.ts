"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateTransactionSchema,
  CreateTransferSchema,
  UpdateTransactionSchema,
} from "@/lib/validations/transaction.schema";
import type {
  Transaction,
  TransactionWithRelations,
  TransactionAmountWithRelations,
} from "@/types/transactions";
import { createMonth } from "@/actions/months";

type ActionResult<T> = { data: T } | { error: string };

type TransactionAmountInput = {
  account_id: string;
  amount: number;
  exchange_rate: number;
  base_amount: number;
};

function normalizeSignedAmount(
  transactionType: "income" | "expense" | "correction",
  value: number
): number {
  if (transactionType === "income") return Math.abs(value);
  if (transactionType === "expense") return -Math.abs(value);
  return value;
}

async function resolveMonthIdFromDate(
  date: string
): Promise<ActionResult<string>> {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { error: "Fecha inválida" };
  }

  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const monthResult = await createMonth(year, month);
  if ("error" in monthResult) return { error: monthResult.error };
  return { data: monthResult.data.id };
}

// --- GET BASE CURRENCY ---
export async function getBaseCurrency(): Promise<ActionResult<string>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", user.id)
      .single();

    return { data: data?.base_currency ?? "USD" };
  } catch {
    return { error: "Error al obtener la moneda base" };
  }
}

// --- GET TRANSACTIONS (by month) ---
export async function getTransactions(
  monthId: string
): Promise<ActionResult<TransactionWithRelations[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        budget_categories ( name, category_type ),
        transaction_amounts (
          id,
          transaction_id,
          account_id,
          amount,
          original_currency,
          exchange_rate,
          base_amount,
          created_at,
          accounts ( name, currency ),
          currencies!original_currency ( symbol )
        )
      `
      )
      .eq("user_id", user.id)
      .eq("month_id", monthId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      month_id: row.month_id,
      category_id: row.category_id,
      transaction_type: row.transaction_type,
      date: row.date,
      description: row.description,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      category_name: row.budget_categories?.name ?? null,
      category_type: row.budget_categories?.category_type ?? null,
      amounts: (row.transaction_amounts ?? []).map(
        (line: any): TransactionAmountWithRelations => ({
          id: line.id,
          transaction_id: line.transaction_id,
          account_id: line.account_id,
          amount: Number(line.amount),
          original_currency: line.original_currency,
          exchange_rate: Number(line.exchange_rate),
          base_amount: Number(line.base_amount),
          created_at: line.created_at,
          account_name: line.accounts?.name ?? "",
          account_currency_symbol:
            line.currencies?.symbol ?? line.original_currency,
        })
      ),
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
    const resolvedMonth = await resolveMonthIdFromDate(parsed.data.date);
    if ("error" in resolvedMonth) return { error: resolvedMonth.error };

    const amountLines = parsed.data.amounts;
    const accountIds = [...new Set(amountLines.map((line) => line.account_id))];
    const { data: accounts, error: accountError } = await supabase
      .from("accounts")
      .select("id, currency")
      .in("id", accountIds)
      .eq("user_id", user.id)
      .returns<{ id: string; currency: string }[]>();

    if (accountError) return { error: accountError.message };
    if (!accounts || accounts.length !== accountIds.length) {
      return { error: "Cuenta no encontrada" };
    }

    if (parsed.data.transaction_type === "transfer") {
      return { error: "Usá createTransfer para transferencias" };
    }
    const transactionType = parsed.data.transaction_type as
      | "income"
      | "expense"
      | "correction";

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        month_id: resolvedMonth.data,
        category_id: parsed.data.category_id,
        transaction_type: parsed.data.transaction_type,
        date: parsed.data.date,
        description: parsed.data.description,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (txError) {
      if (txError.code === "23503") {
        return { error: "Cuenta o categoría no encontrada" };
      }
      return { error: txError.message };
    }

    const accountById = new Map(accounts.map((acc) => [acc.id, acc.currency]));

    const rows = amountLines.map((line) => {
      const signedAmount = normalizeSignedAmount(
        transactionType,
        line.amount
      );
      const signedBaseAmount = normalizeSignedAmount(
        transactionType,
        line.base_amount
      );

      return {
        transaction_id: transaction.id,
        account_id: line.account_id,
        amount: signedAmount,
        original_currency: accountById.get(line.account_id) ?? "USD",
        exchange_rate: line.exchange_rate,
        base_amount: signedBaseAmount,
      };
    });

    const { error: lineError } = await supabase
      .from("transaction_amounts")
      .insert(rows);

    if (lineError) {
      await supabase.from("transactions").delete().eq("id", transaction.id);
      if (lineError.code === "23503") {
        return { error: "Cuenta no encontrada" };
      }
      return { error: lineError.message };
    }

    return { data: transaction as Transaction };
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
    const resolvedMonth = await resolveMonthIdFromDate(parsed.data.date);
    if ("error" in resolvedMonth) return { error: resolvedMonth.error };

    // Lookup both accounts and currencies
    const { data: sourceAccount } = await supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", parsed.data.source_account_id)
      .eq("user_id", user.id)
      .single();

    if (!sourceAccount) return { error: "Cuenta origen no encontrada" };

    const { data: destAccount } = await supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", parsed.data.destination_account_id)
      .eq("user_id", user.id)
      .single();

    if (!destAccount) return { error: "Cuenta destino no encontrada" };

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        month_id: resolvedMonth.data,
        category_id: null,
        transaction_type: "transfer" as const,
        date: parsed.data.date,
        description: parsed.data.description,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (txError) return { error: txError.message };

    const transferLines: TransactionAmountInput[] = [
      {
        account_id: sourceAccount.id,
        amount: -Math.abs(parsed.data.amount),
        exchange_rate: parsed.data.exchange_rate,
        base_amount: -Math.abs(parsed.data.base_amount),
      },
      {
        account_id: destAccount.id,
        amount: Math.abs(parsed.data.amount),
        exchange_rate: parsed.data.exchange_rate,
        base_amount: Math.abs(parsed.data.base_amount),
      },
    ];

    const rows = transferLines.map((line) => ({
      transaction_id: transaction.id,
      account_id: line.account_id,
      amount: line.amount,
      original_currency:
        line.account_id === sourceAccount.id
          ? sourceAccount.currency
          : destAccount.currency,
      exchange_rate: line.exchange_rate,
      base_amount: line.base_amount,
    }));

    const { error: lineError } = await supabase
      .from("transaction_amounts")
      .insert(rows);

    if (lineError) {
      await supabase.from("transactions").delete().eq("id", transaction.id);
      return { error: lineError.message };
    }

    return { data: transaction as Transaction };
  } catch {
    return { error: "Error al crear la transferencia" };
  }
}

function buildLegacyAmountLines(
  existingType: string,
  updates: {
    amount?: number;
    exchange_rate?: number;
    base_amount?: number;
    source_account_id?: string;
    destination_account_id?: string;
  },
  currentLines: { account_id: string; amount: number }[]
): TransactionAmountInput[] | null {
  if (
    updates.amount == null ||
    updates.exchange_rate == null ||
    updates.base_amount == null
  ) {
    return null;
  }

  if (existingType === "transfer") {
    const sourceFromCurrent =
      currentLines.find((line) => line.amount < 0)?.account_id ??
      currentLines[0]?.account_id;
    const destinationFromCurrent =
      currentLines.find((line) => line.amount > 0)?.account_id ??
      currentLines[1]?.account_id;

    const sourceAccountId = updates.source_account_id ?? sourceFromCurrent;
    const destinationAccountId =
      updates.destination_account_id ?? destinationFromCurrent;

    if (!sourceAccountId || !destinationAccountId) return null;

    return [
      {
        account_id: sourceAccountId,
        amount: -Math.abs(updates.amount),
        exchange_rate: updates.exchange_rate,
        base_amount: -Math.abs(updates.base_amount),
      },
      {
        account_id: destinationAccountId,
        amount: Math.abs(updates.amount),
        exchange_rate: updates.exchange_rate,
        base_amount: Math.abs(updates.base_amount),
      },
    ];
  }

  const existingLine = currentLines[0];
  if (!existingLine) return null;
  return [
    {
      account_id: existingLine.account_id,
      amount: normalizeSignedAmount(
        existingType as "income" | "expense" | "correction",
        updates.amount
      ),
      exchange_rate: updates.exchange_rate,
      base_amount: normalizeSignedAmount(
        existingType as "income" | "expense" | "correction",
        updates.base_amount
      ),
    },
  ];
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

    const {
      id,
      transaction_type,
      amounts,
      source_account_id,
      destination_account_id,
      amount,
      exchange_rate,
      base_amount,
      ...updates
    } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: existing } = await supabase
      .from("transactions")
      .select("id, transaction_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) return { error: "Transacción no encontrada" };
    if (transaction_type && transaction_type !== existing.transaction_type) {
      return { error: "No se puede cambiar el tipo de transacción" };
    }

    let nextMonthId: string | undefined;
    if (updates.date) {
      const resolvedMonth = await resolveMonthIdFromDate(updates.date);
      if ("error" in resolvedMonth) return { error: resolvedMonth.error };
      nextMonthId = resolvedMonth.data;
    }

    const payload = {
      ...updates,
      ...(nextMonthId ? { month_id: nextMonthId } : {}),
    };

    const { data: updatedTransaction, error: txError } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (txError) return { error: txError.message };

    let amountLines = amounts ?? null;
    if (!amountLines) {
      const { data: currentLines } = await supabase
        .from("transaction_amounts")
        .select("account_id, amount")
        .eq("transaction_id", id);

      amountLines = buildLegacyAmountLines(
        existing.transaction_type,
        {
          amount,
          exchange_rate,
          base_amount,
          source_account_id,
          destination_account_id,
        },
        currentLines ?? []
      );
    }

    if (amountLines) {
      const accountIds = [...new Set(amountLines.map((line) => line.account_id))];
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, currency")
        .in("id", accountIds)
        .eq("user_id", user.id)
        .returns<{ id: string; currency: string }[]>();

      if (!accounts || accounts.length !== accountIds.length) {
        return { error: "Cuenta no encontrada" };
      }

      const accountById = new Map(accounts.map((acc) => [acc.id, acc.currency]));

      const { error: deleteLinesError } = await supabase
        .from("transaction_amounts")
        .delete()
        .eq("transaction_id", id);

      if (deleteLinesError) return { error: deleteLinesError.message };

      const rows = amountLines.map((line) => ({
        transaction_id: id,
        account_id: line.account_id,
        amount: line.amount,
        original_currency: accountById.get(line.account_id) ?? "USD",
        exchange_rate: line.exchange_rate,
        base_amount: line.base_amount,
      }));

      const { error: insertLinesError } = await supabase
        .from("transaction_amounts")
        .insert(rows);

      if (insertLinesError) return { error: insertLinesError.message };
    }

    return { data: updatedTransaction as Transaction };
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

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    return { data: null };
  } catch {
    return { error: "Error al eliminar la transacción" };
  }
}
