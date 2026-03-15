"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonths, useEnsureCurrentMonth } from "@/hooks/useMonths";
import {
  useAccountNetWorth,
  useLiabilitiesForYear,
  useNetWorthEvolution,
} from "@/hooks/useNetWorth";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { MONTH_NAMES, formatAmount, amountTone } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/types/accounts";
import { NetWorthEvolutionChart } from "./_components/NetWorthEvolutionChart";
import { ExternalLink } from "lucide-react";

export default function NetWorthPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = months ?? [];

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const availableYears = useMemo(() => {
    const years = new Set(sortedMonths.map((m) => m.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [sortedMonths]);

  useEffect(() => {
    if (!availableYears.length) return;
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [selectedYear, availableYears]);

  const year = selectedYear ?? 0;

  const { data: assetsSummary, isLoading: loadingAssets } = useAccountNetWorth(year);
  const { data: liabilities, isLoading: loadingLiabilities } = useLiabilitiesForYear(year);
  const { data: evolution, isLoading: loadingEvolution } = useNetWorthEvolution(year);
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  const totalAssets = assetsSummary?.total ?? 0;
  const totalLiabilities = liabilities?.total ?? 0;
  const netWorth = totalAssets - totalLiabilities;

  // Group accounts by type
  const groupedAccounts = useMemo(() => {
    if (!assetsSummary) return [];
    const map = new Map<
      string,
      { type: AccountType; label: string; accounts: typeof assetsSummary.accounts; total: number }
    >();
    for (const acc of assetsSummary.accounts) {
      const type = acc.account_type as AccountType;
      if (!map.has(type)) {
        map.set(type, {
          type,
          label: ACCOUNT_TYPE_LABELS[type] ?? type,
          accounts: [],
          total: 0,
        });
      }
      const group = map.get(type)!;
      group.accounts.push(acc);
      group.total += acc.balance_base + acc.investment_value_base;
    }
    return Array.from(map.values());
  }, [assetsSummary]);

  const isLoading = (loadingAssets || loadingLiabilities) && !selectedYear;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Patrimonio neto</h1>
        <p className="text-muted-foreground text-sm">
          Resumen de activos, pasivos y evolución de tu patrimonio.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={selectedYear?.toString() ?? ""}
          onValueChange={(v) => setSelectedYear(Number(v))}
          disabled={ensureCurrentMonth.isPending}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assetsSummary && assetsSummary.month > 0 && (
          <span className="text-muted-foreground text-sm">
            al cierre de {MONTH_NAMES[assetsSummary.month - 1]}
          </span>
        )}
      </div>

      {selectedYear && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="gap-0 py-0">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardDescription>Total Activos</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-green-600">
                  {currencySymbol} {formatAmount(totalAssets)}
                </p>
              </CardContent>
            </Card>

            <Card className="gap-0 py-0">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardDescription>Total Pasivos</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-red-600">
                  {currencySymbol} {formatAmount(totalLiabilities)}
                </p>
              </CardContent>
            </Card>

            <Card className="gap-0 py-0">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardDescription>Patrimonio Neto</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-2xl font-bold ${amountTone(netWorth)}`}>
                  {currencySymbol} {formatAmount(netWorth)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Evolution Chart */}
          {!loadingEvolution && evolution && (
            <NetWorthEvolutionChart data={evolution} currencySymbol={currencySymbol} />
          )}

          {/* Detail Sections */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Assets Detail */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Activos</h2>
              {groupedAccounts.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No hay cuentas activas.
                  </p>
                </div>
              ) : (
                groupedAccounts.map((group) => (
                  <div
                    key={group.type}
                    className="overflow-hidden rounded-md border"
                  >
                    <div className="border-b bg-muted/30 px-4 py-2">
                      <span className="text-sm font-semibold">{group.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {currencySymbol} {formatAmount(group.total)}
                      </span>
                    </div>
                    {group.accounts.map((acc) => {
                      const totalValueBase = acc.balance_base + acc.investment_value_base;
                      return (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
                        >
                          <div>
                            <span className="text-sm font-medium">{acc.name}</span>
                            {acc.investment_value_base > 0 && (
                              <span className="text-muted-foreground ml-2 text-xs">
                                (inv: {currencySymbol} {formatAmount(acc.investment_value_base)})
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium">
                              {currencySymbol} {formatAmount(totalValueBase)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Liabilities Detail */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Pasivos</h2>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/debts">
                    <ExternalLink className="mr-1 size-3" />
                    Gestionar deudas
                  </Link>
                </Button>
              </div>
              {!liabilities || liabilities.items.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No hay pasivos registrados.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <div className="border-b bg-muted/30 px-4 py-2">
                    <span className="text-sm font-semibold">Deudas</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {currencySymbol} {formatAmount(liabilities.total)}
                    </span>
                  </div>
                  {liabilities.items.map((item) => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-medium">
                          {item.currency_symbol} {formatAmount(item.amount)}
                        </span>
                        {item.amount_base !== null && item.currency !== baseCurrency && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            ≈ {currencySymbol} {formatAmount(item.amount_base)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
