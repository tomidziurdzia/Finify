"use client";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      toast.success("Ítem de patrimonio creado");
    },
    onError: (err: Error) => toast.error(err.message),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      toast.success("Ítem actualizado");
    },
    onError: (err: Error) => toast.error(err.message),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      toast.success("Ítem eliminado");
    },
    onError: (err: Error) => toast.error(err.message),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      queryClient.invalidateQueries({ queryKey: NW_KEYS.year(year) });
      toast.success("Valor guardado");
    },
    onError: (err: Error) => toast.error(err.message),
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
  });
}

/* ------------------------------------------------------------------ */
/* Hooks para Deudas (liabilities)                                     */
/* ------------------------------------------------------------------ */

export function useDebts() {
  return useQuery({
    queryKey: [...NW_KEYS.items, "debts"],
    queryFn: async () => {
      const result = await getNwItems();
      if ("error" in result) throw new Error(result.error);
      return (result.data as NwItemWithRelations[]).filter(
        (item) => item.side === "liability"
      );
    },
  });
}

export function useCreateDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreateNwItemInput, "side">) => {
      const result = await createNwItem({ ...input, side: "liability" });
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      toast.success("Deuda creada");
    },
    onError: (err: Error) => toast.error(err.message),
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
  });
}
