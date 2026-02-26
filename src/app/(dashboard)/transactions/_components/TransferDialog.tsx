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
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import {
  useCreateTransfer,
  useUpdateTransaction,
} from "@/hooks/useTransactions";
import { CreateTransferSchema } from "@/lib/validations/transaction.schema";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { fetchExchangeRate } from "@/lib/frankfurter";
import type { TransactionWithRelations } from "@/types/transactions";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface TransferDialogProps {
  transfer: TransactionWithRelations | null;
  monthId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferDialog({
  transfer,
  monthId,
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
  const [destinationAmount, setDestinationAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fetchingRate, setFetchingRate] = useState(false);

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const createTransferMutation = useCreateTransfer();
  const updateMutation = useUpdateTransaction();

  const isPending =
    createTransferMutation.isPending || updateMutation.isPending;

  const activeAccounts = accounts?.filter((a) => a.is_active) ?? [];

  const sourceAccount = activeAccounts.find((a) => a.id === sourceAccountId);
  const destAccount = activeAccounts.find((a) => a.id === destinationAccountId);
  const destinationCurrency = destAccount?.currency ?? "";

  const filteredDestAccounts = activeAccounts.filter(
    (a) => a.id !== sourceAccountId
  );

  // Track whether the user manually edited destination amount
  const destinationManuallyEdited = useRef(false);
  // Keep a ref to amount for async FX callback
  const amountRef = useRef(amount);
  amountRef.current = amount;

  // Auto-fetch exchange rate from source currency to destination currency
  useEffect(() => {
    if (isEditing || !sourceAccount || !destAccount || !currencies) return;

    const sourceCurrency = sourceAccount.currency;
    const targetCurrency = destAccount.currency;
    if (sourceCurrency === targetCurrency) {
      setExchangeRate("1");
      const amt = parseNumberInput(amountRef.current);
      if (!isNaN(amt) && amt > 0) {
          setDestinationAmount(formatNumberInput(String(amt).replace(".", ",")));
      }
      return;
    }

    // Check both currencies are fiat
    const sourceCurrencyInfo = currencies.find((c) => c.code === sourceCurrency);
    const targetCurrencyInfo = currencies.find((c) => c.code === targetCurrency);
    if (
      sourceCurrencyInfo?.currency_type !== "fiat" ||
      targetCurrencyInfo?.currency_type !== "fiat"
    ) {
      return;
    }

    let cancelled = false;
    setFetchingRate(true);

    fetchExchangeRate(sourceCurrency, targetCurrency, date).then((rate) => {
      if (cancelled) return;
      setFetchingRate(false);
      if (rate !== null) {
        const formattedRate = formatNumberInput(String(rate).replace(".", ","));
        setExchangeRate(formattedRate);
        destinationManuallyEdited.current = false;
        // Recalculate base if amount already entered
        const amt = parseNumberInput(amountRef.current);
        if (!isNaN(amt) && amt > 0) {
          const base = Math.round(amt * rate * 100) / 100;
          setDestinationAmount(formatNumberInput(String(base).replace(".", ",")));
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    sourceAccountId,
    destinationAccountId,
    date,
    isEditing,
    sourceAccount,
    destAccount,
    currencies,
  ]);

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
      const sourceLine =
        transfer.amounts.find((line) => line.amount < 0) ?? transfer.amounts[0];
      const destinationLine =
        transfer.amounts.find((line) => line.amount > 0) ?? transfer.amounts[1];

      setDate(transfer.date);
      setSourceAccountId(sourceLine?.account_id ?? "");
      setDestinationAccountId(destinationLine?.account_id ?? "");
      setDescription(transfer.description);
      setAmount(
        formatNumberInput(
          String(Math.abs(sourceLine?.amount ?? 0)).replace(".", ",")
        )
      );
      setExchangeRate(
        formatNumberInput(String(sourceLine?.exchange_rate ?? 1).replace(".", ","))
      );
      setDestinationAmount(
        formatNumberInput(
          String(Math.abs(sourceLine?.base_amount ?? 0)).replace(".", ",")
        )
      );
      setNotes(transfer.notes ?? "");
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setSourceAccountId(activeAccounts[0]?.id ?? "");
      setDestinationAccountId("");
      setDescription("");
      setAmount("");
      setExchangeRate("1");
      setDestinationAmount("");
      setNotes("");
    }
    setErrors({});
    destinationManuallyEdited.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer, open]);

  const handleAmountChange = (val: string) => {
    const formatted = formatNumberInput(val);
    setAmount(formatted);
    const amt = parseNumberInput(formatted);
    if (destinationManuallyEdited.current) {
      // User set destination manually → recalculate rate
      const base = parseNumberInput(destinationAmount);
      if (!isNaN(amt) && amt > 0 && !isNaN(base) && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        setExchangeRate(formatNumberInput(String(newRate).replace(".", ",")));
      }
    } else {
      // Destination was auto-calculated → recalculate from rate
      const rate = parseNumberInput(exchangeRate);
      if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        setDestinationAmount(formatNumberInput(String(newBase).replace(".", ",")));
      }
    }
  };

  const handleRateChange = (val: string) => {
    const formatted = formatNumberInput(val);
    setExchangeRate(formatted);
    destinationManuallyEdited.current = false;
    const amt = parseNumberInput(amount);
    const rate = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      setDestinationAmount(formatNumberInput(String(newBase).replace(".", ",")));
    }
  };

  const handleDestinationAmountChange = (val: string) => {
    destinationManuallyEdited.current = true;
    const formatted = formatNumberInput(val);
    setDestinationAmount(formatted);
    const amt = parseNumberInput(amount);
    const base = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(base)) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      setExchangeRate(formatNumberInput(String(newRate).replace(".", ",")));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const amountNum = parseNumberInput(amount);
    const rateNum = parseNumberInput(exchangeRate);
    const destinationNum = parseNumberInput(destinationAmount);

    if (isEditing) {
      try {
        await updateMutation.mutateAsync({
          id: transfer.id,
          date,
          description,
          amounts: [
            {
              account_id: sourceAccountId,
              amount: -Math.abs(isNaN(amountNum) ? 0 : amountNum),
              exchange_rate: isNaN(rateNum) ? 1 : rateNum,
              base_amount: -Math.abs(isNaN(destinationNum) ? 0 : destinationNum),
            },
            {
              account_id: destinationAccountId,
              amount: Math.abs(isNaN(amountNum) ? 0 : amountNum),
              exchange_rate: isNaN(rateNum) ? 1 : rateNum,
              base_amount: Math.abs(isNaN(destinationNum) ? 0 : destinationNum),
            },
          ],
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
      month_id: monthId,
      date,
      source_account_id: sourceAccountId,
      destination_account_id: destinationAccountId,
      description,
      amount: isNaN(amountNum) ? 0 : amountNum,
      exchange_rate: isNaN(rateNum) ? 1 : rateNum,
      base_amount: isNaN(destinationNum) ? 0 : destinationNum,
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
              <Label htmlFor="tf-rate">
                Tipo de cambio
                {fetchingRate && (
                  <Loader2 className="ml-1 inline size-3 animate-spin" />
                )}
              </Label>
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
              <Label htmlFor="tf-base">
                Monto destino{destinationCurrency ? ` (${destinationCurrency})` : ""}
              </Label>
              <Input
                id="tf-base"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={destinationAmount}
                onChange={(e) => handleDestinationAmountChange(e.target.value)}
                disabled={isPending}
              />
              <p className="text-muted-foreground text-xs">
                Monto en la moneda de la cuenta destino.
              </p>
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
