"use client";

import { useState, useEffect, useRef } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import {
  useCreateTransfer,
  useUpdateTransaction,
} from "@/hooks/useTransactions";
import { CreateTransferSchema } from "@/lib/validations/transaction.schema";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import type { TransactionWithRelations } from "@/types/transactions";
import { format } from "date-fns";

interface TransferDialogProps {
  transfer: TransactionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferDialog({
  transfer,
  open,
  onOpenChange,
}: TransferDialogProps) {
  const isEditing = !!transfer;

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [baseAmount, setBaseAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastEdited, setLastEdited] = useState<"amount" | "rate" | "base">(
    "amount"
  );

  const { data: accounts } = useAccounts();
  const createTransferMutation = useCreateTransfer();
  const updateMutation = useUpdateTransaction();

  const isPending =
    createTransferMutation.isPending || updateMutation.isPending;

  const activeAccounts = accounts?.filter((a) => a.is_active) ?? [];

  const sourceAccount = activeAccounts.find((a) => a.id === sourceAccountId);
  const destAccount = activeAccounts.find((a) => a.id === destinationAccountId);

  const filteredDestAccounts = activeAccounts.filter(
    (a) => a.id !== sourceAccountId
  );

  const skipEffect = useRef(false);

  // Auto-calculate: when amount or rate changes → update base_amount
  useEffect(() => {
    if (skipEffect.current) {
      skipEffect.current = false;
      return;
    }
    const amt = parseNumberInput(amount);
    const rate = parseNumberInput(exchangeRate);

    if (lastEdited !== "base" && !isNaN(amt) && !isNaN(rate) && rate > 0) {
      skipEffect.current = true;
      setBaseAmount(formatNumberInput(String(Math.round(amt * rate * 100) / 100).replace(".", ",")));
    }
  }, [amount, exchangeRate, lastEdited]);

  // When base_amount changes manually → update exchange_rate
  useEffect(() => {
    if (skipEffect.current) {
      skipEffect.current = false;
      return;
    }
    const amt = parseNumberInput(amount);
    const base = parseNumberInput(baseAmount);

    if (lastEdited === "base" && !isNaN(amt) && amt > 0 && !isNaN(base)) {
      skipEffect.current = true;
      const rate = Math.round((base / amt) * 100000000) / 100000000;
      setExchangeRate(formatNumberInput(String(rate).replace(".", ",")));
    }
  }, [baseAmount, amount, lastEdited]);

  // Auto-generate description from account names
  useEffect(() => {
    if (isEditing) return;
    const srcName = sourceAccount?.name;
    const dstName = destAccount?.name;
    if (srcName && dstName) {
      setDescription(`${srcName} → ${dstName}`);
    } else if (srcName) {
      setDescription(`${srcName} →`);
    } else {
      setDescription("");
    }
  }, [sourceAccountId, destinationAccountId, sourceAccount, destAccount, isEditing]);

  useEffect(() => {
    if (transfer) {
      setDate(transfer.date);
      setSourceAccountId(transfer.account_id);
      setDestinationAccountId("");
      setDescription(transfer.description);
      setAmount(formatNumberInput(String(transfer.amount).replace(".", ",")));
      setExchangeRate(formatNumberInput(String(transfer.exchange_rate).replace(".", ",")));
      setBaseAmount(formatNumberInput(String(transfer.base_amount).replace(".", ",")));
      setNotes(transfer.notes ?? "");
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setSourceAccountId(activeAccounts[0]?.id ?? "");
      setDestinationAccountId("");
      setDescription("");
      setAmount("");
      setExchangeRate("1");
      setBaseAmount("");
      setNotes("");
    }
    setErrors({});
    setLastEdited("amount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer, open]);

  const handleAmountChange = (val: string) => {
    setLastEdited("amount");
    setAmount(formatNumberInput(val));
  };

  const handleRateChange = (val: string) => {
    setLastEdited("rate");
    setExchangeRate(formatNumberInput(val));
  };

  const handleBaseAmountChange = (val: string) => {
    setLastEdited("base");
    setBaseAmount(formatNumberInput(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const amountNum = parseNumberInput(amount);
    const rateNum = parseNumberInput(exchangeRate);
    const baseNum = parseNumberInput(baseAmount);

    if (isEditing) {
      try {
        await updateMutation.mutateAsync({
          id: transfer.id,
          date,
          description,
          amount: isNaN(amountNum) ? 0 : amountNum,
          exchange_rate: isNaN(rateNum) ? 1 : rateNum,
          base_amount: isNaN(baseNum) ? 0 : baseNum,
          category_id: null,
          notes: notes || null,
        });
        onOpenChange(false);
      } catch {
        // Error handled by mutation onError (toast)
      }
      return;
    }

    const formData = {
      date,
      source_account_id: sourceAccountId,
      destination_account_id: destinationAccountId,
      description,
      amount: isNaN(amountNum) ? 0 : amountNum,
      exchange_rate: isNaN(rateNum) ? 1 : rateNum,
      base_amount: isNaN(baseNum) ? 0 : baseNum,
      notes,
    };

    const parsed = CreateTransferSchema.safeParse(formData);
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
      await createTransferMutation.mutateAsync(parsed.data);
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar transferencia" : "Nueva transferencia"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de la transferencia."
              : "Transferí fondos entre tus cuentas."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fecha */}
          <div className="space-y-2">
            <Label htmlFor="tf-date">Fecha</Label>
            <Input
              id="tf-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isPending}
            />
            {errors.date && (
              <p className="text-destructive text-sm">{errors.date}</p>
            )}
          </div>

          {/* Cuentas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cuenta origen</Label>
              <Select
                value={sourceAccountId}
                onValueChange={(val) => {
                  setSourceAccountId(val);
                  if (val === destinationAccountId) {
                    setDestinationAccountId("");
                  }
                }}
                disabled={isPending || isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.source_account_id && (
                <p className="text-destructive text-sm">
                  {errors.source_account_id}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Cuenta destino</Label>
              <Select
                value={destinationAccountId}
                onValueChange={setDestinationAccountId}
                disabled={isPending || isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDestAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.destination_account_id && (
                <p className="text-destructive text-sm">
                  {errors.destination_account_id}
                </p>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="tf-desc">Descripción</Label>
            <Input
              id="tf-desc"
              placeholder="Ej: Traspaso a broker, Recarga wallet..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
            />
            {errors.description && (
              <p className="text-destructive text-sm">{errors.description}</p>
            )}
          </div>

          {/* Monto + TC + Base */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tf-amount">
                Monto{sourceAccount ? ` (${sourceAccount.currency})` : ""}
              </Label>
              <Input
                id="tf-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={isPending}
              />
              {errors.amount && (
                <p className="text-destructive text-sm">{errors.amount}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tf-rate">Tipo de cambio</Label>
              <Input
                id="tf-rate"
                type="text"
                inputMode="decimal"
                placeholder="1"
                value={exchangeRate}
                onChange={(e) => handleRateChange(e.target.value)}
                disabled={isPending}
              />
              {errors.exchange_rate && (
                <p className="text-destructive text-sm">
                  {errors.exchange_rate}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tf-base">Monto base</Label>
              <Input
                id="tf-base"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={baseAmount}
                onChange={(e) => handleBaseAmountChange(e.target.value)}
                disabled={isPending}
              />
              {errors.base_amount && (
                <p className="text-destructive text-sm">
                  {errors.base_amount}
                </p>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="tf-notes">Notas (opcional)</Label>
            <Input
              id="tf-notes"
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
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Guardando..."
                : isEditing
                  ? "Guardar cambios"
                  : "Crear transferencia"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
