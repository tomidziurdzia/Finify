"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransactions,
  createTransaction,
  createTransfer,
  updateTransaction,
  deleteTransaction,
} from "@/actions/transactions";
import type { CreateTransactionInput, CreateTransferInput, UpdateTransactionInput } from "@/lib/validations/transaction.schema";
import { toast } from "sonner";

const TRANSACTION_KEYS = {
  all: ["transactions"] as const,
  list: (year: number, month: number) =>
    ["transactions", year, month] as const,
};

export function useTransactions(year: number, month: number) {
  return useQuery({
    queryKey: TRANSACTION_KEYS.list(year, month),
    queryFn: async () => {
      const result = await getTransactions(year, month);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
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
