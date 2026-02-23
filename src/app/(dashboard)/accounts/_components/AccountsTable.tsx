"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccounts, useDeleteAccount } from "@/hooks/useAccounts";
import { accountTypeLabels } from "@/lib/validations/account.schema";
import { AccountDialog } from "./AccountDialog";

export function AccountsTable() {
  const { data: result, isLoading } = useAccounts();
  const deleteMutation = useDeleteAccount();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<{
    id: string;
    name: string;
    account_type: string;
    currency: string;
    notes: string | null;
  } | null>(null);

  const accounts = result && "data" in result ? result.data : [];

  function handleEdit(account: typeof editingAccount) {
    setEditingAccount(account);
    setDialogOpen(true);
  }

  function handleNew() {
    setEditingAccount(null);
    setDialogOpen(true);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar la cuenta "${name}"?`)) return;
    const result = await deleteMutation.mutateAsync(id);
    if ("error" in result) {
      alert(result.error);
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Cargando cuentas...</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cuentas</h1>
        <Button onClick={handleNew}>+ Nueva cuenta</Button>
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="mt-4 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account: {
                id: string;
                name: string;
                account_type: string;
                currency: string;
                is_active: boolean;
                notes: string | null;
              }) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    {accountTypeLabels[account.account_type as keyof typeof accountTypeLabels] ?? account.account_type}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{account.currency}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={account.is_active ? "default" : "outline"}>
                      {account.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(account)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(account.id, account.name)}
                    >
                      Eliminar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="text-muted-foreground text-sm">
            No tenés cuentas creadas todavía.
          </p>
          <Button variant="outline" onClick={handleNew}>
            Crear tu primera cuenta
          </Button>
        </div>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
      />
    </>
  );
}
