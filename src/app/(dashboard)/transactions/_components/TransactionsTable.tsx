"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeftRight,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { MONTH_NAMES, formatAmount, amountTone } from "@/lib/format";
import { useMonthSummary, getPrimaryLine } from "@/hooks/useMonthSummary";

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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(
    null,
  );
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] =
    useState<TransactionWithRelations | null>(null);
  const [deletingTx, setDeletingTx] = useState<TransactionWithRelations | null>(
    null,
  );
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
    const found = currencies?.find(
      (currency) => currency.code === baseCurrency,
    );
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  const tableTransactions = useMemo(() => transactions ?? [], [transactions]);

  const { monthSummary, accountMonthlyBalances } = useMonthSummary(
    transactions,
    openingBalances,
  );

  const accountFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const tx of tableTransactions) {
      const accountName =
        (tx.transaction_type === "transfer"
          ? tx.amounts.find((line) => line.amount < 0)?.account_name
          : tx.amounts[0]?.account_name) ?? null;
      if (accountName) values.add(accountName);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [tableTransactions]);

  const categoryFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const tx of tableTransactions) {
      if (tx.category_name) values.add(tx.category_name);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [tableTransactions]);

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
        filterFn: "equalsString",
        cell: ({ row }) => {
          const type = row.original.transaction_type;
          return (
            <Badge
              variant="secondary"
              className={TYPE_BADGE_STYLES[type] ?? ""}
            >
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
        filterFn: "equalsString",
        cell: ({ row }) => getPrimaryLine(row.original)?.account_name ?? "—",
      },
      {
        accessorKey: "category_name",
        header: "Categoría",
        enableSorting: false,
        filterFn: "equalsString",
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
            Math.abs(getPrimaryLine(row.original)?.base_amount ?? 0),
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEdit(tx)}
              >
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
    [baseCurrencySymbol],
  );

  const table = useReactTable({
    data: tableTransactions,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!query) return true;
      const tx = row.original;
      const accountName =
        (tx.transaction_type === "transfer"
          ? tx.amounts.find((line) => line.amount < 0)?.account_name
          : tx.amounts[0]?.account_name) ?? "";
      const haystack = [
        tx.description,
        tx.category_name ?? "",
        accountName,
        TRANSACTION_TYPE_LABELS[tx.transaction_type],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
                  {MONTH_NAMES[month.month - 1]} {month.year}
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
          <Button
            onClick={handleCreateTx}
            size="sm"
            disabled={!selectedMonthId}
          >
            <Plus className="mr-1 size-4" />
            Nueva transacción
          </Button>
        </div>
      </div>

      {selectedMonth && (
        <p className="text-lg font-semibold">
          {MONTH_NAMES[selectedMonth.month - 1]} {selectedMonth.year}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Saldo apertura</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p
              className={`text-2xl font-semibold ${amountTone(monthSummary.openingBase)}`}
            >
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(monthSummary.openingBase)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Ingresos</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-green-600">
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(Math.abs(monthSummary.income))}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Gastos Esenciales</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-red-600">
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(Math.abs(monthSummary.essentialExpenses))}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Gastos Discrecionales</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-orange-600">
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(Math.abs(monthSummary.discretionaryExpenses))}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Pago de Deudas</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-rose-600">
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(Math.abs(monthSummary.debtPayments))}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Ahorros</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-cyan-600">
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(Math.abs(monthSummary.savings))}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Inversiones</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-indigo-600">
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(Math.abs(monthSummary.investments))}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>Saldo cierre</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p
              className={`text-2xl font-semibold ${amountTone(monthSummary.closingBase)}`}
            >
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(monthSummary.closingBase)}
            </p>
          </CardContent>
        </Card>
      </div>

      {selectedMonth && (
        <div className="rounded-md border p-3 sm:p-4">
          <p className="text-base font-semibold">
            Saldos por cuenta - {MONTH_NAMES[selectedMonth.month - 1]}{" "}
            {selectedMonth.year}
          </p>
          <p className="text-muted-foreground mb-3 text-xs">
            Inicio y cierre del mes seleccionado.
          </p>
          {accountMonthlyBalances.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {accountMonthlyBalances.map((account) => (
                <div
                  key={account.name}
                  className="bg-muted/20 space-y-2 rounded-md border px-3 py-2.5"
                >
                  <p className="text-foreground truncate text-sm font-semibold">
                    {account.name} ({account.currencyCode})
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Inicio del mes
                    </span>
                    <span
                      className={`whitespace-nowrap text-sm font-semibold ${amountTone(account.opening)}`}
                    >
                      {account.symbol} {formatAmount(account.opening)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Final del mes</span>
                    <span
                      className={`whitespace-nowrap text-sm font-semibold ${amountTone(account.closing)}`}
                    >
                      {account.symbol} {formatAmount(account.closing)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay saldos iniciales cargados para este mes.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-start gap-2">
        <Input
          className="w-full md:w-80"
          placeholder="Buscar descripción/cuenta/categoría..."
          value={globalFilter}
          onChange={(event) => {
            setGlobalFilter(event.target.value);
            table.setPageIndex(0);
          }}
        />
        <Select
          value={
            (table.getColumn("transaction_type")?.getFilterValue() as string) ??
            "all"
          }
          onValueChange={(value) => {
            table
              .getColumn("transaction_type")
              ?.setFilterValue(value === "all" ? undefined : value);
            table.setPageIndex(0);
          }}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="income">Ingreso</SelectItem>
            <SelectItem value="expense">Gasto</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="correction">Corrección</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            (table.getColumn("account_name")?.getFilterValue() as string) ??
            "all"
          }
          onValueChange={(value) => {
            table
              .getColumn("account_name")
              ?.setFilterValue(value === "all" ? undefined : value);
            table.setPageIndex(0);
          }}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Cuenta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accountFilterOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={
            (table.getColumn("category_name")?.getFilterValue() as string) ??
            "all"
          }
          onValueChange={(value) => {
            table
              .getColumn("category_name")
              ?.setFilterValue(value === "all" ? undefined : value);
            table.setPageIndex(0);
          }}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categoryFilterOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                          header.getContext(),
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
                        ? `No hay transacciones en ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}.`
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
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {table.getFilteredRowModel().rows.length} resultado(s)
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / pág</SelectItem>
              <SelectItem value="20">20 / pág</SelectItem>
              <SelectItem value="50">50 / pág</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <span className="text-sm">
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {Math.max(table.getPageCount(), 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Siguiente
          </Button>
        </div>
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
                  eliminará la transacción y sus líneas asociadas. Esta acción
                  no se puede deshacer.
                </>
              ) : (
                <>
                  ¿Estás seguro de que querés eliminar la transacción{" "}
                  <span className="font-semibold">
                    {deletingTx?.description}
                  </span>
                  ? Esta acción no se puede deshacer.
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
                ? `Vas a crear ${MONTH_NAMES[nextMonthPreview.month - 1]} ${nextMonthPreview.year}. Revisá los saldos iniciales por cuenta antes de confirmar.`
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
                    <Card
                      key={balance.account_id}
                      className="gap-0 overflow-hidden py-0"
                    >
                      <CardHeader className="bg-muted/35 px-4 py-3">
                        <CardTitle className="text-sm">
                          {balance.account_name}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {balance.account_currency}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1 px-4 py-3">
                        <p
                          className={`text-base font-semibold ${amountTone(
                            balance.opening_amount,
                          )}`}
                        >
                          {balance.account_currency_symbol}{" "}
                          {formatAmount(balance.opening_amount)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Base:{" "}
                          {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
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
