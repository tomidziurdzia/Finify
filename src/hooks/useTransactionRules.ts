"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransactionRules,
  createTransactionRule,
  updateTransactionRule,
  deleteTransactionRule,
  matchTransactionRules,
} from "@/actions/transaction-rules";
import type {
  CreateTransactionRuleInput,
  UpdateTransactionRuleInput,
} from "@/lib/validations/transaction-rules.schema";
import type { TransactionRuleWithCategory } from "@/types/transaction-rules";
import { toast } from "sonner";

const RULES_KEYS = {
  all: ["transaction-rules"] as const,
};

export function useTransactionRules() {
  return useQuery({
    queryKey: RULES_KEYS.all,
    queryFn: async () => {
      const result = await getTransactionRules();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateTransactionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionRuleInput) => {
      const result = await createTransactionRule(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: RULES_KEYS.all });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Regla creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEYS.all });
    },
  });
}

export function useUpdateTransactionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTransactionRuleInput) => {
      const result = await updateTransactionRule(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (updatedRule) => {
      await queryClient.cancelQueries({ queryKey: RULES_KEYS.all });
      const previous = queryClient.getQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all
      );
      queryClient.setQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all,
        (old) =>
          (old ?? []).map((rule) =>
            rule.id === updatedRule.id ? { ...rule, ...updatedRule } : rule
          )
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RULES_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Regla actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEYS.all });
    },
  });
}

export function useDeleteTransactionRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTransactionRule(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: RULES_KEYS.all });
      const previous = queryClient.getQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all
      );
      queryClient.setQueryData<TransactionRuleWithCategory[]>(
        RULES_KEYS.all,
        (old) => (old ?? []).filter((rule) => rule.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(RULES_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Regla eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEYS.all });
    },
  });
}

export function useMatchRules() {
  return useMutation({
    mutationFn: async ({
      description,
      notes,
    }: {
      description: string;
      notes?: string | null;
    }) => {
      const result = await matchTransactionRules(description, notes);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}
