"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
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
  Form,
  FormField,
  FormItem,
  FormLabel as FormFieldLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useBudgetCategories } from "@/hooks/useBudget";
import {
  useCreateTransaction,
  useUpdateTransaction,
  useBaseCurrency,
} from "@/hooks/useTransactions";
import { CreateTransactionSchema } from "@/lib/validations/transaction.schema";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { fetchExchangeRate } from "@/lib/frankfurter";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
  type TransactionWithRelations,
} from "@/types/transactions";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface TransactionDialogProps {
  transaction: TransactionWithRelations | null;
  monthId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DIALOG_TRANSACTION_TYPES: TransactionType[] = [
  "expense",
  "income",
  "correction",
];

type TransactionFormValues = {
  date: string;
  transaction_type: TransactionType;
  account_id: string;
  category_id: string;
  description: string;
  amount: string;
  exchange_rate: string;
  base_amount: string;
  notes: string;
};

export function TransactionDialog({
  transaction,
  monthId,
  open,
  onOpenChange,
}: TransactionDialogProps) {
  const isEditing = !!transaction;

  const form = useForm<TransactionFormValues>({
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      transaction_type: "expense",
      account_id: "",
      category_id: "",
      description: "",
      amount: "",
      exchange_rate: "1",
      base_amount: "",
      notes: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: categories } = useBudgetCategories();
  const { data: baseCurrency } = useBaseCurrency();
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();

  const isPending = createMutation.isPending || updateMutation.isPending;

  const fetchingRateRef = useRef(false);

  const activeAccounts = accounts?.filter((a) => a.is_active) ?? [];

  const watchTransactionType = form.watch("transaction_type");
  const watchAccountId = form.watch("account_id");
  const watchDate = form.watch("date");

  const selectedAccount = activeAccounts.find((a) => a.id === watchAccountId);

  const showCategory = watchTransactionType !== "transfer";

  // Track whether the user manually edited base_amount
  const baseManuallyEdited = useRef(false);
  // Keep a ref to amount for async FX callback
  const amountRef = useRef(form.getValues("amount"));
  amountRef.current = form.watch("amount");

  // Auto-fetch exchange rate from Frankfurter when account or date changes
  useEffect(() => {
    if (isEditing || !selectedAccount || !baseCurrency || !currencies) return;

    const accountCurrency = selectedAccount.currency;
    if (accountCurrency === baseCurrency) {
      form.setValue("exchange_rate", "1");
      return;
    }

    const accountCurrencyInfo = currencies.find(
      (c) => c.code === accountCurrency,
    );
    const baseCurrencyInfo = currencies.find((c) => c.code === baseCurrency);
    if (
      accountCurrencyInfo?.currency_type !== "fiat" ||
      baseCurrencyInfo?.currency_type !== "fiat"
    ) {
      return;
    }

    let cancelled = false;
    fetchingRateRef.current = true;

    fetchExchangeRate(accountCurrency, baseCurrency, watchDate).then((rate) => {
      if (cancelled) return;
      fetchingRateRef.current = false;
      if (rate !== null) {
        const formattedRate = formatNumberInput(
          String(rate).replace(".", ","),
        );
        form.setValue("exchange_rate", formattedRate);
        baseManuallyEdited.current = false;
        const amt = parseNumberInput(amountRef.current);
        if (!isNaN(amt) && amt > 0) {
          const base = Math.round(amt * rate * 100) / 100;
          form.setValue(
            "base_amount",
            formatNumberInput(String(base).replace(".", ",")),
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isEditing, selectedAccount, baseCurrency, currencies, watchDate, form]);

  // Sync form when transaction changes
  useEffect(() => {
    if (transaction) {
      const line = transaction.amounts[0];
      form.reset({
        date: transaction.date,
        transaction_type: transaction.transaction_type,
        account_id: line?.account_id ?? "",
        category_id: transaction.category_id ?? "",
        description: transaction.description,
        amount: formatNumberInput(
          String(Math.abs(line?.amount ?? 0)).replace(".", ","),
        ),
        exchange_rate: formatNumberInput(
          String(line?.exchange_rate ?? 1).replace(".", ","),
        ),
        base_amount: formatNumberInput(
          String(Math.abs(line?.base_amount ?? 0)).replace(".", ","),
        ),
        notes: transaction.notes ?? "",
      });
    } else {
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        transaction_type: "expense",
        account_id: activeAccounts[0]?.id ?? "",
        category_id: "",
        description: "",
        amount: "",
        exchange_rate: "1",
        base_amount: "",
        notes: "",
      });
    }
    baseManuallyEdited.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, open, activeAccounts.length]);

  const handleAmountChange = (val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("amount", formatted);
    const amt = parseNumberInput(formatted);
    if (baseManuallyEdited.current) {
      // User set base manually → recalculate rate
      const base = parseNumberInput(form.watch("base_amount"));
      if (!isNaN(amt) && amt > 0 && !isNaN(base) && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue(
          "exchange_rate",
          formatNumberInput(String(newRate).replace(".", ",")),
        );
      }
    } else {
      // Base was auto-calculated → recalculate base from rate
      const rate = parseNumberInput(form.watch("exchange_rate"));
      if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue(
          "base_amount",
          formatNumberInput(String(newBase).replace(".", ",")),
        );
      }
    }
  };

  const handleRateChange = (val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("exchange_rate", formatted);
    baseManuallyEdited.current = false;
    const amt = parseNumberInput(form.watch("amount"));
    const rate = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue(
        "base_amount",
        formatNumberInput(String(newBase).replace(".", ",")),
      );
    }
  };

  const handleBaseAmountChange = (val: string) => {
    baseManuallyEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("base_amount", formatted);
    const amt = parseNumberInput(form.watch("amount"));
    const base = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(base)) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue(
        "exchange_rate",
        formatNumberInput(String(newRate).replace(".", ",")),
      );
    }
  };

  const onSubmit = async (values: TransactionFormValues) => {
    form.clearErrors();

    const amountNum = parseNumberInput(values.amount);
    const rateNum = parseNumberInput(values.exchange_rate);
    const baseNum = parseNumberInput(values.base_amount);

    const formData = {
      date: values.date,
      transaction_type: values.transaction_type,
      category_id: showCategory ? values.category_id || null : null,
      description: values.description,
      amounts: [
        {
          account_id: values.account_id,
          amount: isNaN(amountNum) ? 0 : amountNum,
          exchange_rate: isNaN(rateNum) ? 1 : rateNum,
          base_amount: isNaN(baseNum) ? 0 : baseNum,
        },
      ],
      notes: values.notes,
    };

    const parsed = CreateTransactionSchema.safeParse(formData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const first = issue.path[0];
        if (first === "amounts") {
          const lineField = issue.path[2];
          if (typeof lineField === "string") {
            const map: Record<string, keyof TransactionFormValues> = {
              account_id: "account_id",
              amount: "amount",
              exchange_rate: "exchange_rate",
              base_amount: "base_amount",
            };
            const key = map[lineField];
            if (key) {
              form.setError(key, { message: issue.message });
            }
          }
          continue;
        }
        if (first && typeof first === "string") {
          const mapRoot: Record<string, keyof TransactionFormValues> = {
            date: "date",
            transaction_type: "transaction_type",
            category_id: "category_id",
            description: "description",
            notes: "notes",
          };
          const key = mapRoot[first];
          if (key) {
            form.setError(key, { message: issue.message });
          }
        }
      }
      return;
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: transaction.id,
          date: parsed.data.date,
          category_id: parsed.data.category_id,
          description: parsed.data.description,
          notes: parsed.data.notes,
          amounts: parsed.data.amounts.map((line) => {
            if (transaction.transaction_type === "income") return line;
            if (transaction.transaction_type === "expense") {
              return {
                ...line,
                amount: -Math.abs(line.amount),
                base_amount: -Math.abs(line.base_amount),
              };
            }
            return line;
          }),
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

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
          {/* Row 1: Fecha + Tipo */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormFieldLabel>Fecha</FormFieldLabel>
                    <FormControl>
                      <Input type="date" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transaction_type"
                render={({ field }) => (
                  <FormItem>
                    <FormFieldLabel>Tipo</FormFieldLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

          {/* Row 2: Cuenta + Categoría */}
          <div
            className={`grid gap-4 ${showCategory ? "grid-cols-2" : "grid-cols-1"}`}
          >
            <FormField
              control={form.control}
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>Cuenta</FormFieldLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
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
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showCategory && (
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormFieldLabel>Categoría</FormFieldLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Row 3: Descripción */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormFieldLabel>Descripción</FormFieldLabel>
                <FormControl>
                  <Input
                    placeholder="Ej: Supermercado, Sueldo, etc."
                    disabled={isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Row 4: Monto + TC + Monto base */}
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>
                    Monto
                    {selectedAccount ? ` (${selectedAccount.currency})` : ""}
                  </FormFieldLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) => handleAmountChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="exchange_rate"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>
                    Tipo de cambio
                    {fetchingRateRef.current && (
                      <Loader2 className="ml-1 inline size-3 animate-spin" />
                    )}
                  </FormFieldLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="1"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) => handleRateChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="base_amount"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>
                    Monto base{baseCurrency ? ` (${baseCurrency})` : ""}
                  </FormFieldLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) =>
                        handleBaseAmountChange(e.target.value)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Row 5: Notas */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormFieldLabel>Notas (opcional)</FormFieldLabel>
                <FormControl>
                  <Input
                    placeholder="Información adicional..."
                    disabled={isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
