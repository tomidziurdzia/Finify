"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  useInvestments,
  useDeleteInvestment,
  useCurrentPrices,
} from "@/hooks/useInvestments";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import { formatAmount, amountTone } from "@/lib/format";
import { ASSET_TYPE_LABELS } from "@/types/investments";
import type { InvestmentWithAccount, HoldingPosition } from "@/types/investments";
import { InvestmentDialog } from "./InvestmentDialog";

export function InvestmentsTable() {
  const {
    data: investments,
    isLoading,
    isError,
    error,
    refetch,
  } = useInvestments();
  const deleteMutation = useDeleteInvestment();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  // Get unique tickers for price fetching
  const tickersForPricing = useMemo(() => {
    if (!investments) return [];
    const unique = new Map<string, string>();
    for (const inv of investments) {
      if (inv.ticker) {
        unique.set(inv.ticker, inv.asset_type);
      }
    }
    return Array.from(unique.entries()).map(([ticker, assetType]) => ({
      ticker,
      assetType,
    }));
  }, [investments]);

  const {
    data: prices,
    refetch: refetchPrices,
    isFetching: fetchingPrices,
  } = useCurrentPrices(tickersForPricing, baseCurrency ?? "USD");

  // Aggregate into holdings
  const holdings = useMemo<HoldingPosition[]>(() => {
    if (!investments) return [];

    const groupKey = (inv: InvestmentWithAccount) =>
      `${inv.ticker ?? inv.asset_name}::${inv.account_id}`;

    const groups = new Map<string, InvestmentWithAccount[]>();
    for (const inv of investments) {
      const key = groupKey(inv);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }

    return Array.from(groups.values()).map((group) => {
      const first = group[0];
      const totalQty = group.reduce((s, i) => s + i.quantity, 0);
      const totalCost = group.reduce((s, i) => s + i.total_cost, 0);
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const ticker = first.ticker ?? first.asset_name;
      const currentPrice = prices?.[ticker] ?? null;
      const currentValue =
        currentPrice !== null ? totalQty * currentPrice : null;
      const gainLoss =
        currentValue !== null ? currentValue - totalCost : null;
      const gainLossPct =
        gainLoss !== null && totalCost > 0
          ? (gainLoss / totalCost) * 100
          : null;

      return {
        ticker,
        asset_name: first.asset_name,
        asset_type: first.asset_type,
        account_id: first.account_id,
        account_name: first.account_name,
        currency: first.currency,
        currency_symbol: first.currency_symbol,
        total_quantity: totalQty,
        avg_cost_per_unit: avgCost,
        total_cost: totalCost,
        current_price: currentPrice,
        current_value: currentValue,
        gain_loss: gainLoss,
        gain_loss_pct: gainLossPct,
        investments: group,
      };
    });
  }, [investments, prices]);

  // Summary totals
  const totalInvested = holdings.reduce((s, h) => s + h.total_cost, 0);
  const totalCurrentValue = holdings.every((h) => h.current_value !== null)
    ? holdings.reduce((s, h) => s + (h.current_value ?? 0), 0)
    : null;
  const totalGainLoss =
    totalCurrentValue !== null ? totalCurrentValue - totalInvested : null;
  const totalGainLossPct =
    totalGainLoss !== null && totalInvested > 0
      ? (totalGainLoss / totalInvested) * 100
      : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] =
    useState<InvestmentWithAccount | null>(null);
  const [deletingInvestment, setDeletingInvestment] =
    useState<InvestmentWithAccount | null>(null);

  const handleCreate = () => {
    setEditingInvestment(null);
    setDialogOpen(true);
  };

  const handleEdit = (inv: InvestmentWithAccount) => {
    setEditingInvestment(inv);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingInvestment) return;
    try {
      await deleteMutation.mutateAsync(deletingInvestment.id);
      setDeletingInvestment(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar inversiones
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchPrices()}
          disabled={fetchingPrices || tickersForPricing.length === 0}
        >
          <RefreshCw
            className={`mr-1 size-4 ${fetchingPrices ? "animate-spin" : ""}`}
          />
          Actualizar precios
        </Button>
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nueva inversión
        </Button>
      </div>

      {/* Summary Cards */}
      {holdings.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>Total Invertido</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">
                {currencySymbol} {formatAmount(totalInvested)}
              </p>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>Valor Actual</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">
                {totalCurrentValue !== null
                  ? `${currencySymbol} ${formatAmount(totalCurrentValue)}`
                  : "—"}
              </p>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>Ganancia / Pérdida</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {totalGainLoss !== null ? (
                <div className="flex items-baseline gap-2">
                  <p
                    className={`text-2xl font-bold ${amountTone(totalGainLoss)}`}
                  >
                    {currencySymbol} {formatAmount(totalGainLoss)}
                  </p>
                  <span
                    className={`text-sm font-medium ${amountTone(totalGainLoss)}`}
                  >
                    ({totalGainLossPct !== null ? formatAmount(totalGainLossPct) : "—"}
                    %)
                  </span>
                </div>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Holdings Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activo</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Costo Prom.</TableHead>
              <TableHead className="text-right">Costo Total</TableHead>
              <TableHead className="text-right">Precio Actual</TableHead>
              <TableHead className="text-right">Valor Actual</TableHead>
              <TableHead className="text-right">G/P</TableHead>
              <TableHead className="w-20 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      No hay inversiones registradas. Agregá tu primera
                      inversión.
                    </p>
                    <Button
                      onClick={handleCreate}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="mr-1 size-4" />
                      Nueva inversión
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              holdings.map((holding) => {
                // If holding has single investment, show edit/delete for it
                const singleInv =
                  holding.investments.length === 1
                    ? (holding.investments[0] as InvestmentWithAccount)
                    : null;

                return (
                  <TableRow key={`${holding.ticker}::${holding.account_id}`}>
                    <TableCell className="font-medium">
                      {holding.asset_name}
                    </TableCell>
                    <TableCell>
                      {holding.ticker && (
                        <Badge variant="secondary">{holding.ticker}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {ASSET_TYPE_LABELS[holding.asset_type]}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {holding.account_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAmount(holding.total_quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.currency_symbol}{" "}
                      {formatAmount(holding.avg_cost_per_unit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.currency_symbol}{" "}
                      {formatAmount(holding.total_cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.current_price !== null
                        ? `${holding.currency_symbol} ${formatAmount(holding.current_price)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.current_value !== null
                        ? `${holding.currency_symbol} ${formatAmount(holding.current_value)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {holding.gain_loss !== null ? (
                        <div>
                          <span
                            className={`text-sm font-medium ${amountTone(holding.gain_loss)}`}
                          >
                            {formatAmount(holding.gain_loss)}
                          </span>
                          {holding.gain_loss_pct !== null && (
                            <span
                              className={`ml-1 text-xs ${amountTone(holding.gain_loss)}`}
                            >
                              ({formatAmount(holding.gain_loss_pct)}%)
                            </span>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {singleInv ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(singleInv)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingInvestment(singleInv)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {holding.investments.length} compras
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <InvestmentDialog
        investment={editingInvestment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingInvestment}
        onOpenChange={(open) => !open && setDeletingInvestment(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar inversión</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la inversión de{" "}
              <span className="font-semibold">
                {deletingInvestment?.asset_name}
              </span>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingInvestment(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
