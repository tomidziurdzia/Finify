"use client";

import { useState, useMemo } from "react";
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
import { useTransactions, useDeleteTransaction } from "@/hooks/useTransactions";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionWithRelations,
} from "@/types/transactions";
import { TransactionDialog } from "./TransactionDialog";
import { TransferDialog } from "./TransferDialog";
import { parseISO, format } from "date-fns";

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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Dialog state
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(
    null
  );
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] =
    useState<TransactionWithRelations | null>(null);
  const [deletingTx, setDeletingTx] =
    useState<TransactionWithRelations | null>(null);

  const {
    data: transactions,
    isLoading,
    isError,
    error,
    refetch,
  } = useTransactions(year, month);
  const deleteMutation = useDeleteTransaction();

  const currentYear = now.getFullYear();
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = 2020; y <= currentYear + 1; y++) arr.push(y);
    return arr;
  }, [currentYear]);

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
        accessorKey: "account_name",
        header: "Cuenta",
        enableSorting: false,
      },
      {
        accessorKey: "category_name",
        header: "Categoría",
        enableSorting: false,
        cell: ({ row }) => row.original.category_name ?? "—",
      },
      {
        accessorKey: "amount",
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
          const color = AMOUNT_COLOR[tx.transaction_type] ?? "";
          return (
            <span className={`font-medium ${color}`}>
              {tx.account_currency_symbol} {formatAmount(tx.amount)}
            </span>
          );
        },
      },
      {
        accessorKey: "base_amount",
        header: "Monto Base",
        enableSorting: false,
        cell: ({ row }) => formatAmount(row.original.base_amount),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const table = useReactTable({
    data: transactions ?? [],
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
    } else {
      setEditingTx(tx);
      setTxDialogOpen(true);
    }
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-10 w-48" />
        </div>
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
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={String(month)}
            onValueChange={(val) => setMonth(Number(val))}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(year)}
            onValueChange={(val) => setYear(Number(val))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleCreateTransfer} size="sm" variant="outline">
            <ArrowLeftRight className="mr-1 size-4" />
            Transferencia
          </Button>
          <Button onClick={handleCreateTx} size="sm">
            <Plus className="mr-1 size-4" />
            Nueva transacción
          </Button>
        </div>
      </div>

      {/* Table */}
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
                      No hay transacciones en {MONTHS[month - 1]} {year}.
                    </p>
                    <Button
                      onClick={handleCreateTx}
                      variant="outline"
                      size="sm"
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

      {/* Transaction Dialog */}
      <TransactionDialog
        transaction={editingTx}
        open={txDialogOpen}
        onOpenChange={setTxDialogOpen}
      />

      {/* Transfer Dialog */}
      <TransferDialog
        transfer={editingTransfer}
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
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
                  eliminarán ambos lados de la transferencia. Esta acción no se
                  puede deshacer.
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
    </>
  );
}
