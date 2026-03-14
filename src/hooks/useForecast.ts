"use client";

import { useQuery } from "@tanstack/react-query";
import { getForecast } from "@/actions/forecast";

export function useForecast(monthsAhead: number = 6) {
  return useQuery({
    queryKey: ["forecast", monthsAhead],
    queryFn: async () => {
      const result = await getForecast(monthsAhead);
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}
