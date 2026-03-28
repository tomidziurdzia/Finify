"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  BUDGET_KEYS,
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
import { useQueryClient } from "@tanstack/react-query";
import { BUDGET_CATEGORY_LABELS, type BudgetCategory } from "@/types/budget";
import type { BudgetLineWithPlan } from "@/types/budget";
import {
  MONTH_NAMES,
  formatAmount,
  amountTone,
  parseMoneyInput,
  formatMoneyDisplay,
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
  const { data: months } = useMonths();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const queryClient = useQueryClient();
  const [amountDraftByCategoryId, setAmountDraftByCategoryId] = useState<
    Record<string, string>
  >({});
  const [editingCategoryIds, setEditingCategoryIds] = useState<
    Record<string, boolean>
  >({});

  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = useMemo(
    () => [...(months ?? [])].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month)),
    [months]
  );

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

  const createLine = useCreateBudgetLine(selectedMonthId);
  const createNextBudgetFromCurrent = useCreateBudgetNextMonthFromSource(
    selectedMonthId,
  );
  const upsertPlan = useUpsertBudgetMonthPlan(selectedMonthId);

  const ensureLineForCategory = async (category: BudgetCategory) => {
    const existing = queryClient
      .getQueryData<BudgetLineWithPlan[]>(BUDGET_KEYS.lines(selectedMonthId ?? ""))
      ?.find((line) => line.category_id === category.id);
    if (existing) return existing;
    return createLine.mutateAsync({
      category_id: category.id,
      name: category.name,
      display_order: category.display_order ?? 0,
      is_active: true,
    });
  };

  const handleDraftAmountChange = useCallback((categoryId: string, value: string) => {
    setAmountDraftByCategoryId((prev) => ({ ...prev, [categoryId]: value }));
  }, []);

  const handleDraftAmountBlur = useCallback((categoryId: string) => {
    setAmountDraftByCategoryId((prev) => ({
      ...prev,
      [categoryId]: formatMoneyDisplay(prev[categoryId] ?? ""),
    }));
  }, []);

  const handleCreateNextBudget = async () => {
    if (!selectedMonthId) return;
    const categories = queryClient.getQueryData<BudgetCategory[]>(BUDGET_KEYS.categories) ?? [];
    const lines =
      queryClient.getQueryData<BudgetLineWithPlan[]>(
        BUDGET_KEYS.lines(selectedMonthId),
      ) ?? [];
    const summary = queryClient.getQueryData<{
      categories: Array<{ category_id: string; planned_amount: number }>;
    }>(BUDGET_KEYS.summary(selectedMonthId));

    const lineByCategoryId = new Map(lines.map((line) => [line.category_id, line]));
    const summaryByCategoryId = new Map(
      (summary?.categories ?? []).map((category) => [
        category.category_id,
        category.planned_amount,
      ]),
    );

    const entries = categories.map((row) => ({
      category_id: row.id,
      planned_amount:
        lineByCategoryId.get(row.id)?.planned_amount ??
        summaryByCategoryId.get(row.id) ??
        0,
    }));
    try {
      const result = await createNextBudgetFromCurrent.mutateAsync(entries);
      setSelectedMonthId(result.month_id);
    } catch {
      // toast in hook
    }
  };

  if (!selectedMonthId) {
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

      <BudgetMonthContent
        selectedMonthId={selectedMonthId}
        currencySymbol={currencySymbol}
        amountDraftByCategoryId={amountDraftByCategoryId}
        editingCategoryIds={editingCategoryIds}
        createLine={createLine}
        upsertPlan={upsertPlan}
        onDraftAmountChange={handleDraftAmountChange}
        onDraftAmountBlur={handleDraftAmountBlur}
        onSetDrafts={setAmountDraftByCategoryId}
        onSetEditingCategoryIds={setEditingCategoryIds}
        onEnsureLineForCategory={ensureLineForCategory}
      />

    </div>
  );
}

function BudgetMonthContent({
  selectedMonthId,
  currencySymbol,
  amountDraftByCategoryId,
  editingCategoryIds,
  createLine,
  upsertPlan,
  onDraftAmountChange,
  onDraftAmountBlur,
  onSetDrafts,
  onSetEditingCategoryIds,
  onEnsureLineForCategory,
}: {
  selectedMonthId: string;
  currencySymbol: string;
  amountDraftByCategoryId: Record<string, string>;
  editingCategoryIds: Record<string, boolean>;
  createLine: ReturnType<typeof useCreateBudgetLine>;
  upsertPlan: ReturnType<typeof useUpsertBudgetMonthPlan>;
  onDraftAmountChange: (categoryId: string, value: string) => void;
  onDraftAmountBlur: (categoryId: string) => void;
  onSetDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetEditingCategoryIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onEnsureLineForCategory: (category: BudgetCategory) => Promise<BudgetLineWithPlan | { id: string }>;
}) {
  const { data: categories, isLoading: categoriesLoading } = useBudgetCategories();
  const { data: lines, isLoading: linesLoading } = useBudgetLines(selectedMonthId);
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary(selectedMonthId);
  const safeCategories = categories ?? [];
  const safeLines = lines ?? [];
  const safeSummary =
    summary ?? { totals: { planned: 0, actual: 0, variance: 0 }, categories: [] };

  const lineByCategoryId = useMemo(() => {
    const map = new Map<string, BudgetLineWithPlan>();
    for (const line of safeLines) {
      if (!map.has(line.category_id)) {
        map.set(line.category_id, line);
      }
    }
    return map;
  }, [safeLines]);

  const summaryByCategoryId = useMemo(() => {
    const map = new Map<string, { planned: number; actual: number; variance: number }>();
    for (const category of safeSummary.categories) {
      map.set(category.category_id, {
        planned: category.planned_amount,
        actual: category.actual_amount,
        variance: category.variance,
      });
    }
    return map;
  }, [safeSummary]);

  const categoryRows = useMemo(
    () =>
      safeCategories
        .slice()
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
        .map((category) => {
          const line = lineByCategoryId.get(category.id) ?? null;
          const summaryValues = summaryByCategoryId.get(category.id);
          const planned = line?.planned_amount ?? summaryValues?.planned ?? 0;
          const actual = summaryValues?.actual ?? 0;
          return { category, line, planned, actual, variance: planned - actual };
        }),
    [safeCategories, lineByCategoryId, summaryByCategoryId],
  );

  const rowsByType = useMemo(() => {
    const map = new Map<keyof typeof BUDGET_CATEGORY_LABELS, typeof categoryRows>();
    for (const row of categoryRows) {
      const type = row.category.category_type;
      const current = map.get(type) ?? [];
      current.push(row);
      map.set(type, current);
    }
    return Array.from(map.entries()).map(([type, rows]) => ({
      type,
      label: BUDGET_CATEGORY_LABELS[type],
      rows: rows.sort((a, b) => a.category.name.localeCompare(b.category.name)),
      plannedTotal: rows.reduce((acc, row) => acc + row.planned, 0),
      actualTotal: rows.reduce((acc, row) => acc + row.actual, 0),
      varianceTotal: rows.reduce((acc, row) => acc + row.variance, 0),
    }));
  }, [categoryRows]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const row of categoryRows) {
      nextDrafts[row.category.id] = formatAmount(row.planned);
    }
    onSetDrafts((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(nextDrafts);
      if (prevKeys.length === nextKeys.length) {
        const isSame = nextKeys.every((key) => prev[key] === nextDrafts[key]);
        if (isSame) return prev;
      }
      return nextDrafts;
    });
  }, [categoryRows, onSetDrafts]);

  if (categoriesLoading || linesLoading || summaryLoading || !categories || !lines || !summary) {
    return <BudgetContentFallback />;
  }

  const handleSaveCategoryAmount = async (category: BudgetCategory) => {
    const amount = parseMoneyInput(amountDraftByCategoryId[category.id] ?? "");
    if (amount == null) return false;

    try {
      const ensuredLine = await onEnsureLineForCategory(category);
      await upsertPlan.mutateAsync({
        line_id: ensuredLine.id,
        month_id: selectedMonthId,
        planned_amount: amount,
      });
      return true;
    } catch {
      return false;
    }
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Plan total</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-semibold">{currencySymbol} {formatAmount(safeSummary.totals.planned)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Real total</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-semibold">{currencySymbol} {formatAmount(safeSummary.totals.actual)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Desvío total</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className={`text-2xl font-semibold ${amountTone(safeSummary.totals.variance)}`}>{currencySymbol} {formatAmount(safeSummary.totals.variance)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Categorías activas</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-semibold">{categoryRows.length}</p></CardContent></Card>
      </div>

      <div className="space-y-3">
        {rowsByType.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-muted-foreground mb-3 text-sm">No hay categorías de presupuesto para este mes.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rowsByType.map((group) => {
              const executionPercent = group.plannedTotal > 0 ? (group.actualTotal / group.plannedTotal) * 100 : 0;
              return (
                <div key={group.type} className="overflow-hidden rounded-md border bg-white">
                  <div className={`px-3 py-2 text-xs font-semibold ${CATEGORY_HEADER_STYLES[group.type] ?? "bg-muted text-foreground"}`}>{group.label}</div>
                  <div className="grid grid-cols-[1fr_auto] border-b bg-muted/20 px-3 py-2 text-xs font-medium"><span>Subcategoría</span><span>Monto</span></div>
                  <div className="max-h-56 overflow-auto">
                    {group.rows.length === 0 ? (
                      <div className="text-muted-foreground px-3 py-2 text-xs">Sin categorías cargadas.</div>
                    ) : (
                      group.rows.map((row) => (
                        <div key={row.category.id} className="grid grid-cols-[1fr_auto] gap-2 border-b px-3 py-2 text-xs">
                          <span className="truncate self-center">{row.category.name}</span>
                          <div className="flex items-center gap-2">
                            <Input className="h-8 w-32 text-right" value={amountDraftByCategoryId[row.category.id] ?? formatAmount(row.planned)} onChange={(event) => onDraftAmountChange(row.category.id, event.target.value)} onBlur={() => onDraftAmountBlur(row.category.id)} inputMode="decimal" placeholder="0,00" disabled={!editingCategoryIds[row.category.id]} />
                            <Button
                              size="sm"
                              variant="outline"
                              title={editingCategoryIds[row.category.id] ? "Guardar monto" : "Editar monto"}
                              onClick={async () => {
                                if (!editingCategoryIds[row.category.id]) {
                                  onSetEditingCategoryIds((prev) => ({ ...prev, [row.category.id]: true }));
                                  return;
                                }
                                const saved = await handleSaveCategoryAmount(row.category);
                                if (saved) {
                                  onSetEditingCategoryIds((prev) => ({ ...prev, [row.category.id]: false }));
                                }
                              }}
                              disabled={upsertPlan.isPending || createLine.isPending}
                            >
                              {editingCategoryIds[row.category.id] ? <Save className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t bg-muted/30 px-3 py-2">
                    <div className="grid grid-cols-[1fr_auto] text-xs font-medium"><span>Total</span><span>{currencySymbol} {formatAmount(group.plannedTotal)}</span></div>
                    <div className="mt-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Ejecutado: {currencySymbol} {formatAmount(group.actualTotal)}</span><span className={amountTone(group.varianceTotal)}>{executionPercent.toFixed(2)}%</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function BudgetContentFallback() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
