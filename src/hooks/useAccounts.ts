"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAccounts,
  getCurrencies,
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/actions/accounts";
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validations/account.schema";
import { toast } from "sonner";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const result = await getAccounts();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const result = await getCurrencies();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: Infinity,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const result = await createAccount(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Cuenta creada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAccountInput) => {
      const result = await updateAccount(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Cuenta actualizada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteAccount(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Cuenta eliminada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
