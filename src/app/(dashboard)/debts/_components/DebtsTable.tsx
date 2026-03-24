"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebts, useDeleteNwItem, useLiabilitiesForYear } from "@/hooks/useNetWorth";
import { useMonths } from "@/hooks/useMonths";
import { formatAmount } from "@/lib/format";
import type { NwItemWithRelations } from "@/types/net-worth";
import { DebtDialog } from "./DebtDialog";

export function DebtsTable() {
  const { data: debts, isLoading, isError, error, refetch } = useDebts();
  const deleteMutation = useDeleteNwItem();
  const { data: months } = useMonths();

  const currentYear = useMemo(() => {
    if (!months || months.length === 0) return new Date().getFullYear();
    const years = months.map((m) => m.year);
    return Math.max(...years);
  }, [months]);

  const { data: liabilities } = useLiabilitiesForYear(currentYear);

  // Map item_id → amount from liabilities summary
  const amountByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (liabilities) {
      for (const item of liabilities.items) {
        map.set(item.item_id, item.amount);
      }
    }
    return map;
  }, [liabilities]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<
    (NwItemWithRelations & { currentAmount?: number }) | null
  >(null);
  const [deletingDebt, setDeletingDebt] = useState<NwItemWithRelations | null>(null);

  const handleCreate = () => {
    setEditingDebt(null);
    setDialogOpen(true);
  };

  const handleEdit = (debt: NwItemWithRelations) => {
    setEditingDebt({
      ...debt,
      currentAmount: amountByItem.get(debt.id) ?? 0,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingDebt) return;
    try {
      await deleteMutation.mutateAsync(deletingDebt.id);
      setDeletingDebt(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">Error al cargar las deudas</p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nueva deuda
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!debts || debts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      No hay deudas registradas. Agregá una deuda para empezar.
                    </p>
                    <Button onClick={handleCreate} variant="outline" size="sm">
                      <Plus className="mr-1 size-4" />
                      Crear deuda
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              debts.map((debt) => (
                <TableRow key={debt.id}>
                  <TableCell className="font-medium">{debt.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{debt.currency}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-medium">
                      {debt.currency_symbol} {formatAmount(amountByItem.get(debt.id) ?? 0)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Editar deuda" onClick={() => handleEdit(debt)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Eliminar deuda" onClick={() => setDeletingDebt(debt)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DebtDialog
        debt={editingDebt}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        year={currentYear}
      />

      <Dialog
        open={!!deletingDebt}
        onOpenChange={(open) => !open && setDeletingDebt(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar deuda</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la deuda{" "}
              <span className="font-semibold">{deletingDebt?.name}</span>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingDebt(null)}
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
