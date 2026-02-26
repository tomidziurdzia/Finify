"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Plus, Pencil, Trash2, ArrowLeftRight, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useTransactions,
  useDeleteTransaction,
  useBaseCurrency,
} from "@/hooks/useTransactions";
import {
  useMonths,
  useEnsureCurrentMonth,
  useCreateNextMonth,
  usePreviewNextMonth,
  useOpeningBalances,
} from "@/hooks/useMonths";
import { useCurrencies } from "@/hooks/useAccounts";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionWithRelations,
} from "@/types/transactions";
import { TransactionDialog } from "./TransactionDialog";
import { TransferDialog } from "./TransferDialog";
import { parseISO, format } from "date-fns";
import type { NextMonthPreview } from "@/types/months";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function amountTone(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  income: "bg-green-100 text-green-800 hover:bg-green-100",
  expense: "bg-red-100 text-red-800 hover:bg-red-100",
  transfer: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  correction: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
};

const AMOUNT_COLOR: Record<string, string> = {
  income: "text-green-600",
  expense: "text-red-600",
  transfer: "text-blue-600",
  correction: "text-yellow-600",
};

export function TransactionsTable() {
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(
    null
  );
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] =
    useState<TransactionWithRelations | null>(null);
  const [deletingTx, setDeletingTx] =
    useState<TransactionWithRelations | null>(null);
  const [createMonthDialogOpen, setCreateMonthDialogOpen] = useState(false);
  const [nextMonthPreview, setNextMonthPreview] =
    useState<NextMonthPreview | null>(null);

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const createNextMonth = useCreateNextMonth();
  const previewNextMonth = usePreviewNextMonth();
  const sortedMonths = months ?? [];

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

  const selectedMonth =
    sortedMonths.find((month) => month.id === selectedMonthId) ?? null;

  const {
    data: transactions,
    isLoading,
    isError,
    error,
    refetch,
  } = useTransactions(selectedMonthId);
  const { data: openingBalances } = useOpeningBalances(selectedMonthId);
  const deleteMutation = useDeleteTransaction();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();

  const baseCurrencySymbol = useMemo(() => {
    if (!baseCurrency) return "";
    const found = currencies?.find((currency) => currency.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  const tableTransactions = useMemo(() => transactions ?? [], [transactions]);

  const getPrimaryLine = (tx: TransactionWithRelations) => {
    if (tx.amounts.length === 0) return null;
    if (tx.transaction_type === "transfer") {
      return tx.amounts.find((line) => line.amount < 0) ?? tx.amounts[0];
    }
    return tx.amounts[0];
  };

  const columns = useMemo<ColumnDef<TransactionWithRelations>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Fecha
            <ArrowUpDown className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => format(parseISO(row.original.date), "dd/MM/yyyy"),
      },
      {
        accessorKey: "description",
        header: "Descripción",
        enableSorting: false,
      },
      {
        accessorKey: "transaction_type",
        header: "Tipo",
        enableSorting: false,
        cell: ({ row }) => {
          const type = row.original.transaction_type;
          return (
            <Badge variant="secondary" className={TYPE_BADGE_STYLES[type] ?? ""}>
              {TRANSACTION_TYPE_LABELS[type]}
            </Badge>
          );
        },
      },
      {
        accessorFn: (row) => getPrimaryLine(row)?.account_name ?? "—",
        id: "account_name",
        header: "Cuenta",
        enableSorting: false,
        cell: ({ row }) => getPrimaryLine(row.original)?.account_name ?? "—",
      },
      {
        accessorKey: "category_name",
        header: "Categoría",
        enableSorting: false,
        cell: ({ row }) => row.original.category_name ?? "—",
      },
      {
        accessorFn: (row) => Math.abs(getPrimaryLine(row)?.amount ?? 0),
        id: "amount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Monto
            <ArrowUpDown className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const tx = row.original;
          const line = getPrimaryLine(tx);
          const color = AMOUNT_COLOR[tx.transaction_type] ?? "";
          return (
            <span className={`font-medium ${color}`}>
              {line?.account_currency_symbol ?? ""}{" "}
              {formatAmount(Math.abs(line?.amount ?? 0))}
            </span>
          );
        },
      },
      {
        accessorFn: (row) => Math.abs(getPrimaryLine(row)?.base_amount ?? 0),
        id: "base_amount",
        header: "Monto Base",
        enableSorting: true,
        cell: ({ row }) =>
          `${baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}${formatAmount(
            Math.abs(getPrimaryLine(row.original)?.base_amount ?? 0)
          )}`,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const tx = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => handleEdit(tx)}>
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeletingTx(tx)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [baseCurrencySymbol]
  );

  const table = useReactTable({
    data: tableTransactions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleCreateTx = () => {
    setEditingTx(null);
    setTxDialogOpen(true);
  };

  const handleCreateTransfer = () => {
    setEditingTransfer(null);
    setTransferDialogOpen(true);
  };

  const handleEdit = (tx: TransactionWithRelations) => {
    if (tx.transaction_type === "transfer") {
      setEditingTransfer(tx);
      setTransferDialogOpen(true);
      return;
    }
    setEditingTx(tx);
    setTxDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTx) return;
    try {
      await deleteMutation.mutateAsync(deletingTx.id);
      setDeletingTx(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const handleCreateNextMonth = async () => {
    try {
      const preview = await previewNextMonth.mutateAsync();
      setNextMonthPreview(preview);
      setCreateMonthDialogOpen(true);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const handleConfirmCreateMonth = async () => {
    try {
      const month = await createNextMonth.mutateAsync();
      setSelectedMonthId(month.id);
      setCreateMonthDialogOpen(false);
      setNextMonthPreview(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading && !selectedMonthId) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar las transacciones
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
                  {MONTHS[month.month - 1]} {month.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateNextMonth}
            disabled={createNextMonth.isPending || previewNextMonth.isPending}
          >
            {previewNextMonth.isPending ? "Calculando..." : "Nuevo mes"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleCreateTransfer}
            size="sm"
            variant="outline"
            disabled={!selectedMonthId}
          >
            <ArrowLeftRight className="mr-1 size-4" />
            Transferencia
          </Button>
          <Button onClick={handleCreateTx} size="sm" disabled={!selectedMonthId}>
            <Plus className="mr-1 size-4" />
            Nueva transacción
          </Button>
        </div>
      </div>

      {selectedMonth && (
        <div className="rounded-md border p-3">
          <p className="text-sm font-medium">
            Saldos Iniciales - {MONTHS[selectedMonth.month - 1]} {selectedMonth.year}
          </p>
          <p className="text-muted-foreground mb-2 text-xs">
            Arrastrados automáticamente desde el mes anterior.
          </p>
          {openingBalances && openingBalances.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {openingBalances.map((ob) => (
                <Card key={ob.id} className="gap-0 overflow-hidden py-0">
                  <CardHeader className="bg-muted/35 px-4 py-3">
                    <CardTitle className="text-sm">{ob.account_name}</CardTitle>
                    <CardDescription className="text-xs">
                      {ob.account_currency}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 px-4 py-3">
                    <p className={`text-base font-semibold ${amountTone(ob.opening_amount)}`}>
                      {ob.account_currency_symbol} {formatAmount(ob.opening_amount)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Base: {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
                      {formatAmount(ob.opening_base_amount)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay saldos iniciales cargados para este mes.
            </p>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      {selectedMonth
                        ? `No hay transacciones en ${MONTHS[selectedMonth.month - 1]} ${selectedMonth.year}.`
                        : "Seleccioná un mes para ver transacciones."}
                    </p>
                    <Button
                      onClick={handleCreateTx}
                      variant="outline"
                      size="sm"
                      disabled={!selectedMonthId}
                    >
                      <Plus className="mr-1 size-4" />
                      Crear transacción
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TransactionDialog
        transaction={editingTx}
        monthId={selectedMonthId}
        open={txDialogOpen}
        onOpenChange={setTxDialogOpen}
      />

      <TransferDialog
        transfer={editingTransfer}
        monthId={selectedMonthId}
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
      />

      <Dialog
        open={!!deletingTx}
        onOpenChange={(open) => !open && setDeletingTx(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar transacción</DialogTitle>
            <DialogDescription>
              {deletingTx?.transaction_type === "transfer" ? (
                <>
                  ¿Estás seguro de que querés eliminar esta transferencia? Se
                  eliminará la transacción y sus líneas asociadas. Esta acción no se
                  puede deshacer.
                </>
              ) : (
                <>
                  ¿Estás seguro de que querés eliminar la transacción{" "}
                  <span className="font-semibold">{deletingTx?.description}</span>?
                  Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingTx(null)}
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

      <Dialog
        open={createMonthDialogOpen}
        onOpenChange={(open) => {
          setCreateMonthDialogOpen(open);
          if (!open) setNextMonthPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear nuevo mes</DialogTitle>
            <DialogDescription>
              {nextMonthPreview
                ? `Vas a crear ${MONTHS[nextMonthPreview.month - 1]} ${nextMonthPreview.year}. Revisá los saldos iniciales por cuenta antes de confirmar.`
                : "Calculando saldos iniciales..."}
            </DialogDescription>
          </DialogHeader>

          {!nextMonthPreview ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="max-h-96 overflow-auto pr-1">
              {nextMonthPreview.balances.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No hay cuentas activas para inicializar saldos.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {nextMonthPreview.balances.map((balance) => (
                    <Card key={balance.account_id} className="gap-0 overflow-hidden py-0">
                      <CardHeader className="bg-muted/35 px-4 py-3">
                        <CardTitle className="text-sm">{balance.account_name}</CardTitle>
                        <CardDescription className="text-xs">
                          {balance.account_currency}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1 px-4 py-3">
                        <p
                          className={`text-base font-semibold ${amountTone(
                            balance.opening_amount
                          )}`}
                        >
                          {balance.account_currency_symbol}{" "}
                          {formatAmount(balance.opening_amount)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Base: {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
                          {formatAmount(balance.opening_base_amount)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateMonthDialogOpen(false);
                setNextMonthPreview(null);
              }}
              disabled={createNextMonth.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmCreateMonth}
              disabled={!nextMonthPreview || createNextMonth.isPending}
            >
              {createNextMonth.isPending ? "Creando..." : "Confirmar y crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
