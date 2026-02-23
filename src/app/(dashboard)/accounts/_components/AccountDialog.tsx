"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateAccount, useUpdateAccount, useCurrencies } from "@/hooks/useAccounts";
import {
  accountTypes,
  accountTypeLabels,
  type CreateAccountInput,
} from "@/lib/validations/account.schema";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: {
    id: string;
    name: string;
    account_type: string;
    currency: string;
    notes: string | null;
  } | null;
}

export function AccountDialog({ open, onOpenChange, account }: AccountDialogProps) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<string>("bank");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: currenciesResult } = useCurrencies();
  const currencies = currenciesResult && "data" in currenciesResult ? currenciesResult.data : [];

  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const isEditing = !!account;

  useEffect(() => {
    if (account) {
      setName(account.name);
      setAccountType(account.account_type);
      setCurrency(account.currency);
      setNotes(account.notes ?? "");
    } else {
      setName("");
      setAccountType("bank");
      setCurrency("USD");
      setNotes("");
    }
    setError(null);
  }, [account, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input: CreateAccountInput = {
      name,
      account_type: accountType as CreateAccountInput["account_type"],
      currency,
      notes: notes || undefined,
    };

    const result = isEditing
      ? await updateMutation.mutateAsync({ id: account!.id, ...input })
      : await createMutation.mutateAsync(input);

    if ("error" in result && result.error) {
      setError(result.error as string);
    } else {
      onOpenChange(false);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: ING, N26, Nexo..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_type">Tipo</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {accountTypeLabels[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Moneda principal</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies?.map((c: { code: string; name: string; symbol: string | null }) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol ? `${c.symbol} ` : ""}{c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre la cuenta..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isEditing ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
