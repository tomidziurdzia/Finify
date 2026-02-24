"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateAccount,
  useUpdateAccount,
  useCurrencies,
} from "@/hooks/useAccounts";
import { CreateAccountSchema } from "@/lib/validations/account.schema";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "@/types/accounts";
import type { Account } from "@/types/accounts";

interface AccountDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountDialog({
  account,
  open,
  onOpenChange,
}: AccountDialogProps) {
  const isEditing = !!account;

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<string>("bank");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: currencies } = useCurrencies();
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Sync form when account changes (edit mode)
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
    setErrors({});
  }, [account, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const formData = {
      name,
      account_type: accountType,
      currency,
      notes,
    };

    // Validate
    const parsed = CreateAccountSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: account.id,
          ...parsed.data,
        });
      } else {
        await createMutation.mutateAsync(parsed.data);
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const fiatCurrencies = currencies?.filter((c) => c.currency_type === "fiat") ?? [];
  const cryptoCurrencies = currencies?.filter((c) => c.currency_type === "crypto") ?? [];
  const etfCurrencies = currencies?.filter((c) => c.currency_type === "etf") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar cuenta" : "Nueva cuenta"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de tu cuenta."
              : "Agregá una nueva cuenta para trackear tus finanzas."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              placeholder="Ej: ING, N26, Nexo..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name}</p>
            )}
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <Label>Tipo de cuenta</Label>
            <Select
              value={accountType}
              onValueChange={setAccountType}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ACCOUNT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account_type && (
              <p className="text-destructive text-sm">
                {errors.account_type}
              </p>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label>Moneda</Label>
            <Select
              value={currency}
              onValueChange={setCurrency}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fiatCurrencies.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Fiat</SelectLabel>
                    {fiatCurrencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {cryptoCurrencies.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Crypto</SelectLabel>
                    {cryptoCurrencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {etfCurrencies.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>ETFs</SelectLabel>
                    {etfCurrencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {errors.currency && (
              <p className="text-destructive text-sm">{errors.currency}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input
              id="notes"
              placeholder="Información adicional..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
            />
            {errors.notes && (
              <p className="text-destructive text-sm">{errors.notes}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Guardando..."
                : isEditing
                  ? "Guardar cambios"
                  : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
