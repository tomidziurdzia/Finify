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
import { useBudgetCategories } from "@/hooks/useBudget";
import {
  useCreateTransaction,
  useUpdateTransaction,
} from "@/hooks/useTransactions";
import { CreateTransactionSchema } from "@/lib/validations/transaction.schema";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
  type TransactionWithRelations,
} from "@/types/transactions";
import { format } from "date-fns";

interface TransactionDialogProps {
  transaction: TransactionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DIALOG_TRANSACTION_TYPES: TransactionType[] = [
  "expense",
  "income",
  "correction",
];

export function TransactionDialog({
  transaction,
  open,
  onOpenChange,
}: TransactionDialogProps) {
  const isEditing = !!transaction;

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [transactionType, setTransactionType] = useState<string>("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
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
  const { data: categories } = useBudgetCategories();
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();

  const isPending = createMutation.isPending || updateMutation.isPending;

  const activeAccounts = accounts?.filter((a) => a.is_active) ?? [];

  const selectedAccount = activeAccounts.find((a) => a.id === accountId);

  const showCategory =
    transactionType === "income" || transactionType === "expense";

  // Track which field was last edited to avoid circular updates
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

  // Sync form when transaction changes
  useEffect(() => {
    if (transaction) {
      setDate(transaction.date);
      setTransactionType(transaction.transaction_type);
      setAccountId(transaction.account_id);
      setCategoryId(transaction.category_id ?? "");
      setDescription(transaction.description);
      setAmount(formatNumberInput(String(transaction.amount).replace(".", ",")));
      setExchangeRate(formatNumberInput(String(transaction.exchange_rate).replace(".", ",")));
      setBaseAmount(formatNumberInput(String(transaction.base_amount).replace(".", ",")));
      setNotes(transaction.notes ?? "");
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTransactionType("expense");
      setAccountId(activeAccounts[0]?.id ?? "");
      setCategoryId("");
      setDescription("");
      setAmount("");
      setExchangeRate("1");
      setBaseAmount("");
      setNotes("");
    }
    setErrors({});
    setLastEdited("amount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, open]);

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

    const formData = {
      date,
      transaction_type: transactionType,
      account_id: accountId,
      category_id: showCategory ? categoryId || null : null,
      description,
      amount: isNaN(amountNum) ? 0 : amountNum,
      exchange_rate: isNaN(rateNum) ? 1 : rateNum,
      base_amount: isNaN(baseNum) ? 0 : baseNum,
      notes,
    };

    const parsed = CreateTransactionSchema.safeParse(formData);
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
          id: transaction.id,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar transacción" : "Nueva transacción"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de la transacción."
              : "Registrá un ingreso, gasto o corrección."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Fecha + Tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tx-date">Fecha</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isPending}
              />
              {errors.date && (
                <p className="text-destructive text-sm">{errors.date}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={transactionType}
                onValueChange={setTransactionType}
                disabled={isPending || isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIALOG_TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {TRANSACTION_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.transaction_type && (
                <p className="text-destructive text-sm">
                  {errors.transaction_type}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Cuenta + Categoría */}
          <div className={`grid gap-4 ${showCategory ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-2">
              <Label>Cuenta</Label>
              <Select
                value={accountId}
                onValueChange={setAccountId}
                disabled={isPending || isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.account_id && (
                <p className="text-destructive text-sm">{errors.account_id}</p>
              )}
            </div>
            {showCategory && (
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category_id && (
                  <p className="text-destructive text-sm">
                    {errors.category_id}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Row 3: Descripción */}
          <div className="space-y-2">
            <Label htmlFor="tx-desc">Descripción</Label>
            <Input
              id="tx-desc"
              placeholder="Ej: Supermercado, Sueldo, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
            />
            {errors.description && (
              <p className="text-destructive text-sm">{errors.description}</p>
            )}
          </div>

          {/* Row 4: Monto + TC + Monto base */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">
                Monto{selectedAccount ? ` (${selectedAccount.currency})` : ""}
              </Label>
              <Input
                id="tx-amount"
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
              <Label htmlFor="tx-rate">Tipo de cambio</Label>
              <Input
                id="tx-rate"
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
              <Label htmlFor="tx-base">Monto base</Label>
              <Input
                id="tx-base"
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

          {/* Row 5: Notas */}
          <div className="space-y-2">
            <Label htmlFor="tx-notes">Notas (opcional)</Label>
            <Input
              id="tx-notes"
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
                  : "Crear transacción"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
