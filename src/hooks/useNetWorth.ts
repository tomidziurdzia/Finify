"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNwItems,
  createNwItem,
  updateNwItem,
  deleteNwItem,
  getNwSnapshotsForMonth,
  upsertNwSnapshot,
} from "@/actions/net-worth";
import type {
  CreateNwItemInput,
  UpdateNwItemInput,
  UpsertNwSnapshotInput,
} from "@/lib/validations/net-worth.schema";
import { toast } from "sonner";

const NW_KEYS = {
  items: ["net-worth", "items"] as const,
  month: (year: number, month: number) =>
    ["net-worth", "month", year, month] as const,
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

export function useUpsertNwSnapshot(year: number, month: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertNwSnapshotInput) => {
      const result = await upsertNwSnapshot(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NW_KEYS.items });
      queryClient.invalidateQueries({ queryKey: NW_KEYS.month(year, month) });
      toast.success("Valor guardado");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
