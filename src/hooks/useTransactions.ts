"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransactions,
  getTransactionsForRange,
  getBaseCurrency,
  getUsageCounts,
  createTransaction,
  createTransfer,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from "@/actions/transactions";
import type { CreateTransactionInput, CreateTransferInput, UpdateTransactionInput } from "@/lib/validations/transaction.schema";
import { toast } from "sonner";

const TRANSACTION_KEYS = {
  all: ["transactions"] as const,
  list: (monthId: string) => ["transactions", monthId] as const,
  range: (start: string, end: string) =>
    ["transactions", "range", start, end] as const,
};

export function useBaseCurrency() {
  return useQuery({
    queryKey: ["baseCurrency"],
    queryFn: async () => {
      const result = await getBaseCurrency();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useUsageCounts() {
  return useQuery({
    queryKey: ["usage-counts"],
    queryFn: async () => {
      const result = await getUsageCounts();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useTransactions(monthId: string | null) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.list(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) return [];
      const result = await getTransactions(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useTransactionsForRange(
  startMonthId: string | null,
  endMonthId: string | null
) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.range(startMonthId ?? "", endMonthId ?? ""),
    enabled: !!startMonthId && !!endMonthId,
    queryFn: async () => {
      if (!startMonthId || !endMonthId) return [];
      const result = await getTransactionsForRange(startMonthId, endMonthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      const result = await createTransaction(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transacción creada correctamente");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransferInput) => {
      const result = await createTransfer(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transferencia creada correctamente");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTransactionInput) => {
      const result = await updateTransaction(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transacción actualizada correctamente");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const restore = useRestoreTransaction();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTransaction(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: (_, deletedId) => {
      toast.success("Transacción eliminada", {
        action: {
          label: "Deshacer",
          onClick: () => restore.mutate(deletedId),
        },
        duration: 8000,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}

export function useRestoreTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await restoreTransaction(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TRANSACTION_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Transacción restaurada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
    },
  });
}
