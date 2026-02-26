"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNextMonthFromLatest,
  getMonths,
  getOpeningBalances,
  getOrCreateCurrentMonth,
  previewNextMonthFromLatest,
} from "@/actions/months";
import { toast } from "sonner";

export const MONTH_KEYS = {
  all: ["months"] as const,
  openingBalances: (monthId: string) => ["opening-balances", monthId] as const,
};

export function useMonths() {
  return useQuery({
    queryKey: MONTH_KEYS.all,
    queryFn: async () => {
      const result = await getMonths();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useEnsureCurrentMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await getOrCreateCurrentMonth();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MONTH_KEYS.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateNextMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await createNextMonthFromLatest();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MONTH_KEYS.all });
      toast.success("Mes creado y saldos arrastrados correctamente");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function usePreviewNextMonth() {
  return useMutation({
    mutationFn: async () => {
      const result = await previewNextMonthFromLatest();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useOpeningBalances(monthId: string | null) {
  return useQuery({
    queryKey: MONTH_KEYS.openingBalances(monthId ?? ""),
    enabled: !!monthId,
    queryFn: async () => {
      if (!monthId) return [];
      const result = await getOpeningBalances(monthId);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}
