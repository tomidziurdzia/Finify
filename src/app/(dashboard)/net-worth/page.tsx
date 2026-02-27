"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMonths,
  useEnsureCurrentMonth,
} from "@/hooks/useMonths";
import {
  useNwItems,
  useCreateNwItem,
  useUpdateNwItem,
  useDeleteNwItem,
  useNwMonthSummary,
  useUpsertNwSnapshot,
} from "@/hooks/useNetWorth";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { MONTH_NAMES, formatAmount, amountTone } from "@/lib/format";
import { NwItemDialog } from "./_components/NwItemDialog";
import type { NwItemWithRelations } from "@/types/net-worth";

function parseMoneyInput(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function NetWorthPage() {
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NwItemWithRelations | null>(null);
  const [deletingItem, setDeletingItem] = useState<NwItemWithRelations | null>(null);
  const [amountDraftByItemId, setAmountDraftByItemId] = useState<Record<string, string>>({});

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = months ?? [];
  const selectedMonth = sortedMonths.find((m) => m.id === selectedMonthId) ?? null;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  useEffect(() => {
    if (!sortedMonths.length) return;
    if (!selectedMonthId || !sortedMonths.some((m) => m.id === selectedMonthId)) {
      setSelectedMonthId(sortedMonths[0].id);
    }
  }, [selectedMonthId, sortedMonths]);

  const { data: items, isLoading: itemsLoading } = useNwItems();
  const { data: summary, isLoading: summaryLoading } = useNwMonthSummary(
    selectedMonth?.year ?? 0,
    selectedMonth?.month ?? 0,
  );
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  const createItem = useCreateNwItem();
  const updateItem = useUpdateNwItem();
  const deleteItem = useDeleteNwItem();
  const upsertSnapshot = useUpsertNwSnapshot(
    selectedMonth?.year ?? 0,
    selectedMonth?.month ?? 0,
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of summary?.items ?? []) {
      next[row.item_id] = formatAmount(row.amount_base ?? row.amount);
    }
    for (const item of items ?? []) {
      if (!(item.id in next)) next[item.id] = "0,00";
    }
    setAmountDraftByItemId(next);
  }, [summary, items]);

  const handleSaveItem = async (data: {
    name: string;
    side: "asset" | "liability";
    account_id: string | null;
    currency: string;
  }) => {
    if (editingItem) {
      await updateItem.mutateAsync({
        id: editingItem.id,
        ...data,
      });
    } else {
      await createItem.mutateAsync({ ...data, display_order: 0 });
    }
  };

  const handleSaveSnapshot = async (itemId: string) => {
    if (!selectedMonth) return;
    const amount = parseMoneyInput(amountDraftByItemId[itemId] ?? "");
    if (amount == null) return;
    await upsertSnapshot.mutateAsync({
      nw_item_id: itemId,
      year: selectedMonth.year,
      month: selectedMonth.month,
      amount,
      amount_base: amount,
    });
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await deleteItem.mutateAsync(deletingItem.id);
      setDeletingItem(null);
    } catch {
      // toast in hook
    }
  };

  const isLoading = itemsLoading || summaryLoading;

  if (isLoading && !selectedMonthId) {
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
          Seguí tus activos y pasivos por mes.
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
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingItem(null);
            setItemDialogOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" />
          Nuevo ítem
        </Button>
      </div>

      {selectedMonth && summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="gap-0 py-0">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardDescription>Total activos</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-green-600">
                  {currencySymbol} {formatAmount(summary.total_assets)}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-0 py-0">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardDescription>Total pasivos</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-red-600">
                  {currencySymbol} {formatAmount(summary.total_liabilities)}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-0 py-0">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardDescription>Patrimonio neto</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p
                  className={`text-2xl font-semibold ${amountTone(summary.net_worth)}`}
                >
                  {currencySymbol} {formatAmount(summary.net_worth)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border">
            <div className="grid grid-cols-[1fr_160px_auto] gap-2 border-b bg-muted/20 px-4 py-4 text-sm font-medium">
              <span>Ítem</span>
              <span className="text-right">Valor</span>
              <span className="w-20" />
            </div>
            {(items ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No hay ítems. Creá uno para empezar.
              </div>
            ) : (
              (items ?? []).map((item) => {
                const summaryRow = summary.items.find((i) => i.item_id === item.id);
                const badge = item.side === "asset" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_160px_auto] gap-2 border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={badge + " rounded px-2 py-0.5 text-xs"}>
                        {item.side === "asset" ? "Activo" : "Pasivo"}
                      </span>
                      <span className="font-medium">{item.name}</span>
                      {item.account_name && (
                        <span className="text-muted-foreground text-xs">
                          ({item.account_name})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 text-right"
                        value={amountDraftByItemId[item.id] ?? "0,00"}
                        onChange={(e) =>
                          setAmountDraftByItemId((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        onBlur={() => handleSaveSnapshot(item.id)}
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                      <span className="text-muted-foreground text-xs">
                        {item.currency_symbol}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingItem(item);
                          setItemDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingItem(item)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      <NwItemDialog
        item={editingItem}
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        onSubmit={handleSaveItem}
      />

      <Dialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar ítem</DialogTitle>
            <DialogDescription>
              ¿Eliminar &quot;{deletingItem?.name}&quot;? Se borrarán todos los
              snapshots asociados. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingItem(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteItem.isPending}
            >
              {deleteItem.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
