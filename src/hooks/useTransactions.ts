"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransactions,
  getBaseCurrency,
  createTransaction,
  createTransfer,
  updateTransaction,
  deleteTransaction,
} from "@/actions/transactions";
import type { CreateTransactionInput, CreateTransferInput, UpdateTransactionInput } from "@/lib/validations/transaction.schema";
import { toast } from "sonner";

const TRANSACTION_KEYS = {
  all: ["transactions"] as const,
  list: (monthId: string) => ["transactions", monthId] as const,
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

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      const result = await createTransaction(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
      toast.success("Transacción creada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
      toast.success("Transferencia creada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
      toast.success("Transacción actualizada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTransaction(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
      toast.success("Transacción eliminada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
