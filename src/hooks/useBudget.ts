"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBudgetYears,
  getOrCreateBudgetYear,
  ensureBudgetSeed,
  getBudgetCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/actions/budget";
import type { BudgetYear, BudgetCategory } from "@/types/budget";
import type {
  CreateBudgetYearInput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/validations/budget.schema";
import { toast } from "sonner";

const BUDGET_KEYS = {
  years: ["budget", "years"] as const,
  categories: ["budget", "categories"] as const,
};

export function useBudgetYears() {
  return useQuery({
    queryKey: BUDGET_KEYS.years,
    queryFn: async () => {
      const result = await getBudgetYears();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useOrCreateBudgetYear(year: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (y?: number) => {
      const yr = y ?? year;
      if (yr == null) throw new Error("Año requerido");
      const result = await getOrCreateBudgetYear(yr);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.years });
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useEnsureBudgetSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await ensureBudgetSeed();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
    },
  });
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: BUDGET_KEYS.categories,
    queryFn: async () => {
      const result = await getBudgetCategories();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      const result = await createCategory(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      toast.success("Categoría creada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCategoryInput) => {
      const result = await updateCategory(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      toast.success("Categoría actualizada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCategory(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      toast.success("Categoría eliminada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
