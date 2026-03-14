"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInvestments,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  fetchCurrentPrices,
} from "@/actions/investments";
import type {
  CreateInvestmentInput,
  UpdateInvestmentInput,
} from "@/lib/validations/investment.schema";
import type { InvestmentWithAccount } from "@/types/investments";
import { toast } from "sonner";

const INVESTMENT_KEYS = {
  all: ["investments"] as const,
  prices: (tickers: string[]) =>
    ["investments", "prices", ...tickers] as const,
};

export function useInvestments() {
  return useQuery({
    queryKey: INVESTMENT_KEYS.all,
    queryFn: async () => {
      const result = await getInvestments();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvestmentInput) => {
      const result = await createInvestment(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: INVESTMENT_KEYS.all });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Inversión registrada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useUpdateInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInvestmentInput) => {
      const result = await updateInvestment(input);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: INVESTMENT_KEYS.all });
    },
    onError: (err: Error) => toast.error(err.message),
    onSuccess: () => {
      toast.success("Inversión actualizada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
    },
  });
}

export function useDeleteInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteInvestment(id);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: INVESTMENT_KEYS.all });
      const previous = queryClient.getQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all
      );
      queryClient.setQueryData<InvestmentWithAccount[]>(
        INVESTMENT_KEYS.all,
        (old) => (old ?? []).filter((inv) => inv.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(INVESTMENT_KEYS.all, context.previous);
      }
      toast.error(_err.message);
    },
    onSuccess: () => {
      toast.success("Inversión eliminada");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: INVESTMENT_KEYS.all });
    },
  });
}

export function useCurrentPrices(
  tickers: { ticker: string; assetType: string }[],
  baseCurrency: string
) {
  const tickerKeys = tickers.map((t) => t.ticker).sort();
  return useQuery({
    queryKey: INVESTMENT_KEYS.prices(tickerKeys),
    enabled: tickers.length > 0 && !!baseCurrency,
    staleTime: 60_000,
    queryFn: async () => {
      const result = await fetchCurrentPrices(tickers, baseCurrency);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });
}
