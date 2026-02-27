"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  useBudgetCategories,
  useBudgetLines,
  useBudgetSummary,
  useCreateBudgetNextMonthFromSource,
  useCreateBudgetLine,
  useUpsertBudgetMonthPlan,
} from "@/hooks/useBudget";
import { useEnsureCurrentMonth, useMonths } from "@/hooks/useMonths";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { BUDGET_CATEGORY_LABELS, type BudgetCategory } from "@/types/budget";
import type { BudgetLineWithPlan } from "@/types/budget";
import {
  MONTH_NAMES,
  formatAmount,
  amountTone,
  parseMoneyInput,
  formatMoneyInput,
} from "@/lib/format";

const CATEGORY_HEADER_STYLES: Record<string, string> = {
  income: "bg-teal-700 text-white",
  essential_expenses: "bg-amber-700 text-white",
  discretionary_expenses: "bg-amber-600 text-white",
  debt_payments: "bg-rose-700 text-white",
  savings: "bg-sky-700 text-white",
  investments: "bg-emerald-700 text-white",
};

export default function BudgetPage() {
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [amountDraftByCategoryId, setAmountDraftByCategoryId] = useState<
    Record<string, string>
  >({});
  const [editingCategoryIds, setEditingCategoryIds] = useState<
    Record<string, boolean>
  >({});

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const sortedMonths = months ?? [];

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);
  const selectedMonth =
    sortedMonths.find((month) => month.id === selectedMonthId) ?? null;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  useEffect(() => {
    if (!sortedMonths.length) return;
    if (
      !selectedMonthId ||
      !sortedMonths.some((month) => month.id === selectedMonthId)
    ) {
      setSelectedMonthId(sortedMonths[0].id);
    }
  }, [selectedMonthId, sortedMonths]);

  const { data: categories, isLoading: categoriesLoading } =
    useBudgetCategories();
  const { data: lines, isLoading: linesLoading } =
    useBudgetLines(selectedMonthId);
  const { data: summary, isLoading: summaryLoading } =
    useBudgetSummary(selectedMonthId);

  const createLine = useCreateBudgetLine(selectedMonthId);
  const createNextBudgetFromCurrent = useCreateBudgetNextMonthFromSource(
    selectedMonthId,
  );
  const upsertPlan = useUpsertBudgetMonthPlan(selectedMonthId);

  const lineByCategoryId = useMemo(() => {
    const map = new Map<string, BudgetLineWithPlan>();
    for (const line of lines ?? []) {
      if (!map.has(line.category_id)) {
        map.set(line.category_id, line);
      }
    }
    return map;
  }, [lines]);

  const linesByCategoryId = useMemo(() => {
    const map = new Map<string, BudgetLineWithPlan[]>();
    for (const line of lines ?? []) {
      const current = map.get(line.category_id) ?? [];
      current.push(line);
      map.set(line.category_id, current);
    }
    for (const [key, value] of map.entries()) {
      map.set(
        key,
        value.sort(
          (a, b) =>
            a.display_order - b.display_order || a.name.localeCompare(b.name),
        ),
      );
    }
    return map;
  }, [lines]);

  const summaryByCategoryId = useMemo(() => {
    const map = new Map<
      string,
      { planned: number; actual: number; variance: number }
    >();
    for (const category of summary?.categories ?? []) {
      map.set(category.category_id, {
        planned: category.planned_amount,
        actual: category.actual_amount,
        variance: category.variance,
      });
    }
    return map;
  }, [summary]);

  const categoryRows = useMemo(
    () =>
      (categories ?? [])
        .slice()
        .sort(
          (a, b) =>
            a.display_order - b.display_order || a.name.localeCompare(b.name),
        )
        .map((category) => {
          const line = lineByCategoryId.get(category.id) ?? null;
          const summaryValues = summaryByCategoryId.get(category.id);
          return {
            category,
            line,
            planned: summaryValues?.planned ?? line?.planned_amount ?? 0,
            actual: summaryValues?.actual ?? 0,
            variance:
              summaryValues?.variance ??
              (line?.planned_amount ?? 0) - (summaryValues?.actual ?? 0),
          };
        }),
    [categories, lineByCategoryId, summaryByCategoryId],
  );

  const rowsByType = useMemo(() => {
    const map = new Map<
      keyof typeof BUDGET_CATEGORY_LABELS,
      typeof categoryRows
    >();
    for (const row of categoryRows) {
      const type = row.category.category_type;
      const current = map.get(type) ?? [];
      current.push(row);
      map.set(type, current);
    }
    return Array.from(map.entries()).map(([type, rows]) => ({
      type,
      label: BUDGET_CATEGORY_LABELS[type],
      rows: rows.sort((a, b) =>
        a.category.name.localeCompare(b.category.name),
      ),
      plannedTotal: rows.reduce((acc, row) => acc + row.planned, 0),
      actualTotal: rows.reduce((acc, row) => acc + row.actual, 0),
      varianceTotal: rows.reduce((acc, row) => acc + row.variance, 0),
    }));
  }, [categoryRows]);

  const ensureLineForCategory = async (category: BudgetCategory) => {
    const existing = lineByCategoryId.get(category.id);
    if (existing) return existing;
    return createLine.mutateAsync({
      category_id: category.id,
      name: category.name,
      display_order: category.display_order ?? 0,
      is_active: true,
    });
  };

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const row of categoryRows) {
      nextDrafts[row.category.id] = formatAmount(row.planned);
    }
    setAmountDraftByCategoryId(nextDrafts);
  }, [categoryRows]);

  const handleDraftAmountChange = (categoryId: string, value: string) => {
    setAmountDraftByCategoryId((prev) => ({ ...prev, [categoryId]: value }));
  };

  const handleDraftAmountBlur = (categoryId: string) => {
    setAmountDraftByCategoryId((prev) => ({
      ...prev,
      [categoryId]: formatMoneyInput(prev[categoryId] ?? ""),
    }));
  };

  const handleSaveCategoryAmount = async (category: BudgetCategory) => {
    if (!selectedMonthId) return false;
    const amount = parseMoneyInput(amountDraftByCategoryId[category.id] ?? "");
    if (amount == null) return false;

    try {
      const ensuredLine = await ensureLineForCategory(category);
      await upsertPlan.mutateAsync({
        line_id: ensuredLine.id,
        month_id: selectedMonthId,
        planned_amount: amount,
      });
      return true;
    } catch {
      // toast in hook
      return false;
    }
  };

  const handleCreateNextBudget = async () => {
    if (!selectedMonthId) return;
    const entries = categoryRows.map((row) => ({
      category_id: row.category.id,
      planned_amount: row.planned,
    }));
    try {
      const result = await createNextBudgetFromCurrent.mutateAsync(entries);
      setSelectedMonthId(result.month_id);
    } catch {
      // toast in hook
    }
  };

  const isLoading = categoriesLoading || linesLoading || summaryLoading;
  if (isLoading && !selectedMonthId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Presupuesto</h1>
        <p className="text-muted-foreground text-sm">
          Planificá tus categorías por mes y compará plan vs real.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={selectedMonthId ?? ""}
            onValueChange={setSelectedMonthId}
            disabled={ensureCurrentMonth.isPending}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              {sortedMonths.map((month) => (
                <SelectItem key={month.id} value={month.id}>
                  {MONTH_NAMES[month.month - 1]} {month.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateNextBudget}
            disabled={!selectedMonthId || createNextBudgetFromCurrent.isPending}
          >
            Crear mes siguiente
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/budget/categories">Categorías</Link>
          </Button>
        </div>
      </div>

      {selectedMonth && (
        <p className="text-lg font-semibold">
          {MONTH_NAMES[selectedMonth.month - 1]} {selectedMonth.year}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Plan total</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold">
              {currencySymbol} {formatAmount(summary?.totals.planned ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Real total</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold">
              {currencySymbol} {formatAmount(summary?.totals.actual ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Desvío total</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p
              className={`text-2xl font-semibold ${amountTone(summary?.totals.variance ?? 0)}`}
            >
              {currencySymbol} {formatAmount(summary?.totals.variance ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Categorías activas</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold">{categoryRows.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {rowsByType.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-muted-foreground mb-3 text-sm">
              No hay categorías de presupuesto para este mes.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rowsByType.map((group) => {
              const executionPercent =
                group.plannedTotal > 0
                  ? (group.actualTotal / group.plannedTotal) * 100
                  : 0;
              return (
                <div
                  key={group.type}
                  className="overflow-hidden rounded-md border bg-white"
                >
                  <div
                    className={`px-3 py-2 text-xs font-semibold ${CATEGORY_HEADER_STYLES[group.type] ?? "bg-muted text-foreground"}`}
                  >
                    {group.label}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] border-b bg-muted/20 px-3 py-2 text-xs font-medium">
                    <span>Subcategoría</span>
                    <span>Monto</span>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    {group.rows.length === 0 ? (
                      <div className="text-muted-foreground px-3 py-2 text-xs">
                        Sin categorías cargadas.
                      </div>
                    ) : (
                      group.rows.map((row) => (
                        <div
                          key={row.category.id}
                          className="grid grid-cols-[1fr_auto] gap-2 border-b px-3 py-2 text-xs"
                        >
                          <span className="truncate self-center">
                            {row.category.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8 w-32 text-right"
                              value={
                                amountDraftByCategoryId[row.category.id] ??
                                formatAmount(row.planned)
                              }
                              onChange={(event) =>
                                handleDraftAmountChange(
                                  row.category.id,
                                  event.target.value,
                                )
                              }
                              onBlur={() => handleDraftAmountBlur(row.category.id)}
                              inputMode="decimal"
                              placeholder="0,00"
                              disabled={!editingCategoryIds[row.category.id]}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              title={
                                editingCategoryIds[row.category.id]
                                  ? "Guardar monto"
                                  : "Editar monto"
                              }
                              onClick={async () => {
                                if (!editingCategoryIds[row.category.id]) {
                                  setEditingCategoryIds((prev) => ({
                                    ...prev,
                                    [row.category.id]: true,
                                  }));
                                  return;
                                }
                                const saved = await handleSaveCategoryAmount(
                                  row.category,
                                );
                                if (saved) {
                                  setEditingCategoryIds((prev) => ({
                                    ...prev,
                                    [row.category.id]: false,
                                  }));
                                }
                              }}
                              disabled={upsertPlan.isPending || createLine.isPending}
                            >
                              {editingCategoryIds[row.category.id] ? (
                                <Save className="h-4 w-4" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t bg-muted/30 px-3 py-2">
                    <div className="grid grid-cols-[1fr_auto] text-xs font-medium">
                      <span>Total</span>
                      <span>{currencySymbol} {formatAmount(group.plannedTotal)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Ejecutado: {currencySymbol} {formatAmount(group.actualTotal)}
                      </span>
                      <span className={amountTone(group.varianceTotal)}>
                        {executionPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
