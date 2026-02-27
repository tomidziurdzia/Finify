"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
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

type TransferFormValues = {
  date: string;
  source_account_id: string;
  destination_account_id: string;
  description: string;
  amount: string;
  exchange_rate: string;
  destination_amount: string;
  notes: string;
};

export function TransferDialog({
  transfer,
  monthId,
  open,
  onOpenChange,
}: TransferDialogProps) {
  const isEditing = !!transfer;

  const form = useForm<TransferFormValues>({
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      source_account_id: "",
      destination_account_id: "",
      description: "",
      amount: "",
      exchange_rate: "1",
      destination_amount: "",
      notes: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const createTransferMutation = useCreateTransfer();
  const updateMutation = useUpdateTransaction();

  const isPending =
    createTransferMutation.isPending || updateMutation.isPending;

  const activeAccounts = accounts?.filter((a) => a.is_active) ?? [];

  const watchSourceId = form.watch("source_account_id");
  const watchDestId = form.watch("destination_account_id");
  const watchDate = form.watch("date");

  const sourceAccount = activeAccounts.find((a) => a.id === watchSourceId);
  const destAccount = activeAccounts.find((a) => a.id === watchDestId);
  const destinationCurrency = destAccount?.currency ?? "";

  const filteredDestAccounts = activeAccounts.filter(
    (a) => a.id !== watchSourceId
  );

  const destinationManuallyEdited = useRef(false);
  const amountRef = useRef(form.getValues("amount"));
  amountRef.current = form.watch("amount");

  const [fetchingRate, setFetchingRate] = useState(false);

  useEffect(() => {
    if (isEditing || !sourceAccount || !destAccount || !currencies) return;

    const sourceCurrency = sourceAccount.currency;
    const targetCurrency = destAccount.currency;
    if (sourceCurrency === targetCurrency) {
      form.setValue("exchange_rate", "1");
      const amt = parseNumberInput(amountRef.current);
      if (!isNaN(amt) && amt > 0) {
        form.setValue(
          "destination_amount",
          formatNumberInput(String(amt).replace(".", ","))
        );
      }
      return;
    }

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

    fetchExchangeRate(sourceCurrency, targetCurrency, watchDate).then((rate) => {
      if (cancelled) return;
      setFetchingRate(false);
      if (rate !== null) {
        const formattedRate = formatNumberInput(String(rate).replace(".", ","));
        form.setValue("exchange_rate", formattedRate);
        destinationManuallyEdited.current = false;
        const amt = parseNumberInput(amountRef.current);
        if (!isNaN(amt) && amt > 0) {
          const base = Math.round(amt * rate * 100) / 100;
          form.setValue(
            "destination_amount",
            formatNumberInput(String(base).replace(".", ","))
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    isEditing,
    sourceAccount,
    destAccount,
    currencies,
    watchDate,
    watchSourceId,
    watchDestId,
    form,
  ]);

  useEffect(() => {
    if (!isEditing && sourceAccount && destAccount) {
      const srcName = sourceAccount.name;
      const dstName = destAccount.name;
      if (srcName && dstName) {
        form.setValue("description", `${srcName} → ${dstName}`);
      } else if (srcName) {
        form.setValue("description", `${srcName} →`);
      } else {
        form.setValue("description", "");
      }
    }
  }, [isEditing, sourceAccount, destAccount, watchSourceId, watchDestId, form]);

  useEffect(() => {
    if (transfer) {
      const sourceLine =
        transfer.amounts.find((line) => line.amount < 0) ?? transfer.amounts[0];
      const destinationLine =
        transfer.amounts.find((line) => line.amount > 0) ?? transfer.amounts[1];

      form.reset({
        date: transfer.date,
        source_account_id: sourceLine?.account_id ?? "",
        destination_account_id: destinationLine?.account_id ?? "",
        description: transfer.description,
        amount: formatNumberInput(
          String(Math.abs(sourceLine?.amount ?? 0)).replace(".", ",")
        ),
        exchange_rate: formatNumberInput(
          String(sourceLine?.exchange_rate ?? 1).replace(".", ",")
        ),
        destination_amount: formatNumberInput(
          String(Math.abs(sourceLine?.base_amount ?? 0)).replace(".", ",")
        ),
        notes: transfer.notes ?? "",
      });
    } else {
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        source_account_id: activeAccounts[0]?.id ?? "",
        destination_account_id: "",
        description: "",
        amount: "",
        exchange_rate: "1",
        destination_amount: "",
        notes: "",
      });
    }
    destinationManuallyEdited.current = false;
  }, [transfer, open, activeAccounts.length, form]);

  const handleAmountChange = (val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("amount", formatted);
    const amt = parseNumberInput(formatted);
    if (destinationManuallyEdited.current) {
      const base = parseNumberInput(form.watch("destination_amount"));
      if (!isNaN(amt) && amt > 0 && !isNaN(base) && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue(
          "exchange_rate",
          formatNumberInput(String(newRate).replace(".", ","))
        );
      }
    } else {
      const rate = parseNumberInput(form.watch("exchange_rate"));
      if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue(
          "destination_amount",
          formatNumberInput(String(newBase).replace(".", ","))
        );
      }
    }
  };

  const handleRateChange = (val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("exchange_rate", formatted);
    destinationManuallyEdited.current = false;
    const amt = parseNumberInput(form.watch("amount"));
    const rate = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue(
        "destination_amount",
        formatNumberInput(String(newBase).replace(".", ","))
      );
    }
  };

  const handleDestinationAmountChange = (val: string) => {
    destinationManuallyEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("destination_amount", formatted);
    const amt = parseNumberInput(form.watch("amount"));
    const base = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(base)) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue(
        "exchange_rate",
        formatNumberInput(String(newRate).replace(".", ","))
      );
    }
  };

  const onSubmit = async (values: TransferFormValues) => {
    form.clearErrors();

    const amountNum = parseNumberInput(values.amount);
    const rateNum = parseNumberInput(values.exchange_rate);
    const destinationNum = parseNumberInput(values.destination_amount);

    if (isEditing) {
      try {
        await updateMutation.mutateAsync({
          id: transfer.id,
          date: values.date,
          description: values.description,
          amounts: [
            {
              account_id: values.source_account_id,
              amount: -Math.abs(isNaN(amountNum) ? 0 : amountNum),
              exchange_rate: isNaN(rateNum) ? 1 : rateNum,
              base_amount: -Math.abs(isNaN(destinationNum) ? 0 : destinationNum),
            },
            {
              account_id: values.destination_account_id,
              amount: Math.abs(isNaN(amountNum) ? 0 : amountNum),
              exchange_rate: isNaN(rateNum) ? 1 : rateNum,
              base_amount: Math.abs(isNaN(destinationNum) ? 0 : destinationNum),
            },
          ],
          category_id: null,
          notes: values.notes || null,
        });
        onOpenChange(false);
      } catch {
        // Error handled by mutation onError (toast)
      }
      return;
    }

    const formData = {
      date: values.date,
      source_account_id: values.source_account_id,
      destination_account_id: values.destination_account_id,
      description: values.description,
      amount: isNaN(amountNum) ? 0 : amountNum,
      exchange_rate: isNaN(rateNum) ? 1 : rateNum,
      base_amount: isNaN(destinationNum) ? 0 : destinationNum,
      notes: values.notes,
    };

    const parsed = CreateTransferSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldMap: Record<string, keyof TransferFormValues> = {
        base_amount: "destination_amount",
      };
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") {
          const key = (fieldMap[field] ?? field) as keyof TransferFormValues;
          if (key in form.getValues()) {
            form.setError(key, { message: issue.message });
          }
        }
      }
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

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl>
                    <Input type="date" disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta origen</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          if (val === form.getValues("destination_account_id")) {
                            form.setValue("destination_account_id", "");
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destination_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta destino</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Traspaso a broker, Recarga wallet..."
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Monto{sourceAccount ? ` (${sourceAccount.currency})` : ""}
                    </FormLabel>
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
                    <FormLabel>
                      Tipo de cambio
                      {fetchingRate && (
                        <Loader2 className="ml-1 inline size-3 animate-spin" />
                      )}
                    </FormLabel>
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
                name="destination_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Monto destino
                      {destinationCurrency ? ` (${destinationCurrency})` : ""}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          handleDestinationAmountChange(e.target.value)
                        }
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Monto en la moneda de la cuenta destino.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
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
                    : "Crear transferencia"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
