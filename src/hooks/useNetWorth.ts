"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNwItems,
  createNwItem,
  updateNwItem,
  deleteNwItem,
  getNwSnapshotsForMonth,
  getNwSnapshotsForYear,
  upsertNwSnapshot,
  getAccountNetWorth,
  getLiabilitiesForYear,
  getNetWorthEvolution,
} from "@/actions/net-worth";
import type {
  CreateNwItemInput,
  UpdateNwItemInput,
  UpsertNwSnapshotInput,
} from "@/lib/validations/net-worth.schema";
import type { NwItemWithRelations } from "@/types/net-worth";
import { toast } from "sonner";

const NW_KEYS = {
  items: ["net-worth", "items"] as const,
  month: (year: number, month: number) =>
    ["net-worth", "month", year, month] as const,
  year: (year: number) => ["net-worth", "year", year] as const,
};

export function useNwItems() {
  return useQuery({
    queryKey: NW_KEYS.items,
    queryFn: async () => {
      const result = await getNwItems();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useCreateNwItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNwItemInput) => {
      const result = await createNwItem(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NW_KEYS.items });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Ítem de patrimonio creado");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
    },
  });
}

export function useUpdateNwItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateNwItemInput) => {
      const result = await updateNwItem(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (updatedItem) => {
      await queryClient.cancelQueries({ queryKey: NW_KEYS.items });
      const previous = queryClient.getQueryData<NwItemWithRelations[]>(NW_KEYS.items);
      queryClient.setQueryData<NwItemWithRelations[]>(NW_KEYS.items, (old) =>
        (old ?? []).map((item) =>
          item.id === updatedItem.id
            ? { ...item, ...updatedItem, updated_at: new Date().toISOString() }
            : item
        )
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NW_KEYS.items, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Ítem actualizado");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
    },
  });
}

export function useDeleteNwItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteNwItem(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NW_KEYS.items });
      const previous = queryClient.getQueryData<NwItemWithRelations[]>(NW_KEYS.items);
      queryClient.setQueryData<NwItemWithRelations[]>(NW_KEYS.items, (old) =>
        (old ?? []).filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NW_KEYS.items, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Ítem eliminado");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
    },
  });
}

export function useNwMonthSummary(year: number, month: number) {
  return useQuery({
    queryKey: NW_KEYS.month(year, month),
    queryFn: async () => {
      const result = await getNwSnapshotsForMonth(year, month);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useNwYearSummary(year: number) {
  return useQuery({
    queryKey: NW_KEYS.year(year),
    enabled: year > 0,
    queryFn: async () => {
      const result = await getNwSnapshotsForYear(year);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useUpsertNwSnapshot(year: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertNwSnapshotInput) => {
      const result = await upsertNwSnapshot(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: NW_KEYS.items });
      await queryClient.cancelQueries({ queryKey: NW_KEYS.year(year) });
      await queryClient.cancelQueries({
        queryKey: NW_KEYS.month(input.year, input.month),
      });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Valor guardado");
    },
    onSettled: (_, __, input) => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      queryClient.invalidateQueries({ queryKey: NW_KEYS.year(year) });
      queryClient.invalidateQueries({
        queryKey: NW_KEYS.month(input.year, input.month),
      });
      queryClient.invalidateQueries({
        queryKey: ["net-worth", "evolution", year],
      });
    },
  });
}

export function useAccountNetWorth(year: number) {
  return useQuery({
    queryKey: ["net-worth", "accounts", year],
    enabled: year > 0,
    queryFn: async () => {
      const result = await getAccountNetWorth(year);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

/* ------------------------------------------------------------------ */
/* Hooks para Deudas (liabilities)                                     */
/* ------------------------------------------------------------------ */

export function useDebts() {
  const { data: allItems, ...rest } = useNwItems();
  const debts = useMemo(
    () => (allItems ?? []).filter((item) => item.side === "liability"),
    [allItems]
  );
  return { data: debts, ...rest };
}

export function useCreateDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreateNwItemInput, "side">) => {
      const result = await createNwItem({ ...input, side: "liability" });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NW_KEYS.items });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Deuda creada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
    },
  });
}

export function useLiabilitiesForYear(year: number) {
  return useQuery({
    queryKey: ["net-worth", "liabilities", year],
    enabled: year > 0,
    queryFn: async () => {
      const result = await getLiabilitiesForYear(year);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useNetWorthEvolution(year: number) {
  return useQuery({
    queryKey: ["net-worth", "evolution", year],
    enabled: year > 0,
    queryFn: async () => {
      const result = await getNetWorthEvolution(year);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}
