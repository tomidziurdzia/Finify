"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/actions/user-preferences";
import { toast } from "sonner";

const PREF_KEYS = {
  all: ["user-preferences"] as const,
  baseCurrency: ["baseCurrency"] as const,
};

export function useUserPreferences() {
  return useQuery({
    queryKey: PREF_KEYS.all,
    queryFn: async () => {
      const result = await getUserPreferences();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      base_currency?: string;
      fx_source?: string;
    }) => {
      const result = await updateUserPreferences(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREF_KEYS.all });
      queryClient.invalidateQueries({ queryKey: PREF_KEYS.baseCurrency });
      toast.success("Preferencias guardadas");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
