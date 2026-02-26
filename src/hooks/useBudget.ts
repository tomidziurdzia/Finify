"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyBudgetLineToCalendarMonths,
  applyBudgetLineToMonths,
  applyBudgetLineToSelectedMonths,
  createBudgetNextMonthFromSource,
  createBudgetLine,
  getBudgetYears,
  getBudgetLines,
  getBudgetRecurrenceRules,
  getBudgetSummaryVsActual,
  getOrCreateBudgetYear,
  ensureBudgetSeed,
  getBudgetCategories,
  materializeBudgetRecurrenceForRange,
  upsertBudgetMonthPlan,
  updateBudgetLine,
  deleteBudgetLine,
  createCategory,
  createOrUpdateBudgetRecurrenceRule,
  deleteBudgetRecurrenceRule,
  updateCategory,
  deleteCategory,
} from "@/actions/budget";
import type {
  BudgetCategory,
  BudgetLineWithPlan,
  BudgetRecurrenceRuleWithLine,
  BudgetSummaryVsActual,
  BudgetYear,
} from "@/types/budget";
import type {
  ApplyBudgetLineToCalendarMonthsInput,
  ApplyBudgetLineToMonthsInput,
  ApplyBudgetLineToSelectedMonthsInput,
  CreateBudgetNextMonthFromSourceInput,
  CreateBudgetLineInput,
  CreateBudgetYearInput,
  CreateCategoryInput,
  CreateOrUpdateBudgetRecurrenceRuleInput,
  MaterializeBudgetRecurrenceInput,
  UpsertBudgetMonthPlanInput,
  UpdateBudgetLineInput,
  UpdateCategoryInput,
} from "@/lib/validations/budget.schema";
import { toast } from "sonner";

const BUDGET_KEYS = {
  years: ["budget", "years"] as const,
  categories: ["budget", "categories"] as const,
  lines: (monthId: string) => ["budget", "lines", monthId] as const,
  recurrence: (lineId?: string) =>
    ["budget", "recurrence", lineId ?? "all"] as const,
  summary: (monthId: string) => ["budget", "summary", monthId] as const,
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

export function useBudgetLines(monthId: string | null) {
  return useQuery<BudgetLineWithPlan[]>({
    queryKey: BUDGET_KEYS.lines(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) return [];
      const result = await getBudgetLines(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateBudgetLine(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBudgetLineInput) => {
      const result = await createBudgetLine(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success("Línea creada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateBudgetLine(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBudgetLineInput) => {
      const result = await updateBudgetLine(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.categories });
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success("Línea actualizada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBudgetLine(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteBudgetLine(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.recurrence() });
      toast.success("Línea eliminada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpsertBudgetMonthPlan(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertBudgetMonthPlanInput) => {
      const result = await upsertBudgetMonthPlan(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(vars.month_id) });
      queryClient.invalidateQueries({
        queryKey: BUDGET_KEYS.summary(vars.month_id),
      });
      if (monthId && monthId !== vars.month_id) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success("Plan mensual actualizado");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApplyBudgetLineToMonths(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyBudgetLineToMonthsInput) => {
      const result = await applyBudgetLineToMonths(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      for (const id of data.month_ids) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(id) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(id) });
      }
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success(`Aplicado en ${data.affected} mes(es)`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApplyBudgetLineToSelectedMonths(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyBudgetLineToSelectedMonthsInput) => {
      const result = await applyBudgetLineToSelectedMonths(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      for (const id of data.month_ids) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(id) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(id) });
      }
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success(`Aplicado en ${data.affected} mes(es)`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApplyBudgetLineToCalendarMonths(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyBudgetLineToCalendarMonthsInput) => {
      const result = await applyBudgetLineToCalendarMonths(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      for (const id of data.month_ids) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(id) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(id) });
      }
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success(`Aplicado en ${data.affected} mes(es)`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateBudgetNextMonthFromSource(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: CreateBudgetNextMonthFromSourceInput["entries"]) => {
      if (!monthId) throw new Error("Mes requerido");
      const result = await createBudgetNextMonthFromSource({
        source_month_id: monthId,
        entries,
      });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["months"] });
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(data.month_id) });
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(data.month_id) });
      toast.success(
        `Presupuesto ${data.month}/${data.year} creado desde el mes actual`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBudgetRecurrenceRules(lineId?: string) {
  return useQuery<BudgetRecurrenceRuleWithLine[]>({
    queryKey: BUDGET_KEYS.recurrence(lineId),
    queryFn: async () => {
      const result = await getBudgetRecurrenceRules(lineId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCreateOrUpdateBudgetRecurrenceRule(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrUpdateBudgetRecurrenceRuleInput) => {
      const result = await createOrUpdateBudgetRecurrenceRule(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: BUDGET_KEYS.recurrence(vars.line_id),
      });
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.recurrence() });
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success("Regla recurrente guardada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBudgetRecurrenceRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteBudgetRecurrenceRule(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.recurrence() });
      toast.success("Regla recurrente eliminada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMaterializeBudgetRecurrence(monthId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MaterializeBudgetRecurrenceInput) => {
      const result = await materializeBudgetRecurrenceForRange(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      for (const id of data.month_ids) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(id) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(id) });
      }
      if (monthId) {
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.lines(monthId) });
        queryClient.invalidateQueries({ queryKey: BUDGET_KEYS.summary(monthId) });
      }
      toast.success("Reglas materializadas");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBudgetSummary(monthId: string | null) {
  return useQuery<BudgetSummaryVsActual>({
    queryKey: BUDGET_KEYS.summary(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) {
        return {
          totals: { planned: 0, actual: 0, variance: 0 },
          categories: [],
        };
      }
      const result = await getBudgetSummaryVsActual(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}
