"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
} from "@/actions/savings-goals";
import type {
  CreateSavingsGoalInput,
  UpdateSavingsGoalInput,
} from "@/lib/validations/savings-goals.schema";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";
import { toast } from "sonner";

const GOALS_KEYS = {
  all: ["savings-goals"] as const,
};

export function useSavingsGoals() {
  return useQuery({
    queryKey: GOALS_KEYS.all,
    queryFn: async () => {
      const result = await getSavingsGoals();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateSavingsGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSavingsGoalInput) => {
      const result = await createSavingsGoal(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: GOALS_KEYS.all });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Meta de ahorro creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: GOALS_KEYS.all });
    },
  });
}

export function useUpdateSavingsGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSavingsGoalInput) => {
      const result = await updateSavingsGoal(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (updatedGoal) => {
      await queryClient.cancelQueries({ queryKey: GOALS_KEYS.all });
      const previous = queryClient.getQueryData<SavingsGoalWithRelations[]>(
        GOALS_KEYS.all
      );
      queryClient.setQueryData<SavingsGoalWithRelations[]>(
        GOALS_KEYS.all,
        (old) =>
          (old ?? []).map((goal) =>
            goal.id === updatedGoal.id
              ? { ...goal, ...updatedGoal, updated_at: new Date().toISOString() }
              : goal
          )
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(GOALS_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Meta de ahorro actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: GOALS_KEYS.all });
    },
  });
}

export function useDeleteSavingsGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteSavingsGoal(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: GOALS_KEYS.all });
      const previous = queryClient.getQueryData<SavingsGoalWithRelations[]>(
        GOALS_KEYS.all
      );
      queryClient.setQueryData<SavingsGoalWithRelations[]>(
        GOALS_KEYS.all,
        (old) => (old ?? []).filter((goal) => goal.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(GOALS_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Meta de ahorro eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: GOALS_KEYS.all });
    },
  });
}
