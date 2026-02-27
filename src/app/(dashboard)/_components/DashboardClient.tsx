"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMonths,
  useEnsureCurrentMonth,
  useOpeningBalances,
} from "@/hooks/useMonths";
import {
  useTransactionsForRange,
  useBaseCurrency,
} from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { useBudgetSummaryForRange } from "@/hooks/useBudget";
import { useMonthSummary } from "@/hooks/useMonthSummary";
import { MONTH_NAMES } from "@/lib/format";
import type { Month } from "@/types/months";

import { SummaryCards } from "./SummaryCards";
import { AccountBalances } from "./AccountBalances";
import { IncomeVsExpensesChart } from "./IncomeVsExpensesChart";
import { ExpenseBreakdownChart } from "./ExpenseBreakdownChart";
import { BudgetExecutionChart } from "./BudgetExecutionChart";

function monthOrder(a: Month, b: Month): number {
  return a.year * 100 + a.month - (b.year * 100 + b.month);
}

export function DashboardClient() {
  const [fromMonthId, setFromMonthId] = useState<string | null>(null);
  const [toMonthId, setToMonthId] = useState<string | null>(null);

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = useMemo(() => [...(months ?? [])], [months]);
  const fromMonth = sortedMonths.find((m) => m.id === fromMonthId) ?? null;
  const toMonth = sortedMonths.find((m) => m.id === toMonthId) ?? null;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  useEffect(() => {
    if (!sortedMonths.length) return;
    const latestId = sortedMonths[0].id;
    if (!fromMonthId || !sortedMonths.some((m) => m.id === fromMonthId)) {
      setFromMonthId(latestId);
    }
    if (!toMonthId || !sortedMonths.some((m) => m.id === toMonthId)) {
      setToMonthId(latestId);
    }
  }, [fromMonthId, toMonthId, sortedMonths]);

  useEffect(() => {
    if (!fromMonth || !toMonth) return;
    if (monthOrder(fromMonth, toMonth) > 0) {
      setFromMonthId(toMonthId);
    }
  }, [toMonthId, fromMonth, toMonth]);

  const startMonthId =
    fromMonth && toMonth && monthOrder(fromMonth, toMonth) <= 0
      ? fromMonthId
      : toMonthId;
  const endMonthId =
    fromMonth && toMonth && monthOrder(fromMonth, toMonth) <= 0
      ? toMonthId
      : fromMonthId;

  const { data: transactions, isLoading: txLoading } =
    useTransactionsForRange(startMonthId, endMonthId);
  const { data: openingBalances } = useOpeningBalances(startMonthId);
  const { data: budgetSummary, isLoading: budgetLoading } =
    useBudgetSummaryForRange(startMonthId, endMonthId);
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  const { monthSummary, accountMonthlyBalances } = useMonthSummary(
    transactions,
    openingBalances,
  );

  const isLoading = txLoading || budgetLoading;

  if (isLoading && !startMonthId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isRange =
    fromMonth && toMonth && fromMonthId !== toMonthId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {isRange
            ? "Resumen financiero del período seleccionado."
            : "Resumen financiero del mes seleccionado."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Desde</span>
          <Select
            value={fromMonthId ?? ""}
            onValueChange={setFromMonthId}
            disabled={ensureCurrentMonth.isPending}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Mes inicial" />
            </SelectTrigger>
            <SelectContent>
              {sortedMonths.map((month) => (
                <SelectItem key={month.id} value={month.id}>
                  {MONTH_NAMES[month.month - 1]} {month.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Hasta</span>
          <Select
            value={toMonthId ?? ""}
            onValueChange={setToMonthId}
            disabled={ensureCurrentMonth.isPending}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Mes final" />
            </SelectTrigger>
            <SelectContent>
              {sortedMonths.map((month) => (
                <SelectItem key={month.id} value={month.id}>
                  {MONTH_NAMES[month.month - 1]} {month.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SummaryCards summary={monthSummary} currencySymbol={currencySymbol} />

      <div className="grid gap-4 md:grid-cols-2">
        <IncomeVsExpensesChart
          summary={monthSummary}
          currencySymbol={currencySymbol}
        />
        <ExpenseBreakdownChart
          summary={monthSummary}
          currencySymbol={currencySymbol}
        />
      </div>

      <BudgetExecutionChart
        budgetSummary={budgetSummary}
        currencySymbol={currencySymbol}
      />

      <AccountBalances
        balances={accountMonthlyBalances}
        selectedMonth={fromMonth}
        endMonth={toMonth}
        baseCurrencyCode={baseCurrency ?? null}
        baseCurrencySymbol={currencySymbol}
      />
    </div>
  );
}
