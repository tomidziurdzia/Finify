"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getCurrencies,
} from "@/actions/accounts";
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validations/account.schema";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(),
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: () => getCurrencies(),
    staleTime: Infinity, // currencies don't change
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(input),
    onSuccess: (result) => {
      if (!("error" in result)) {
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccountInput) => updateAccount(input),
    onSuccess: (result) => {
      if (!("error" in result)) {
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: (result) => {
      if (!("error" in result)) {
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    },
  });
}
