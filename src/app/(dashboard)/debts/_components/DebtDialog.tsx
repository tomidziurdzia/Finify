"use client";

import { useEffect } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDebt, useUpdateNwItem, useUpsertNwSnapshot } from "@/hooks/useNetWorth";
import { useCurrencies } from "@/hooks/useAccounts";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { formatMoneyInput, formatMoneyDisplay, parseMoneyInput } from "@/lib/format";
import { fetchExchangeRate } from "@/lib/frankfurter";
import type { NwItemWithRelations } from "@/types/net-worth";

interface DebtDialogProps {
  debt: (NwItemWithRelations & { currentAmount?: number }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
}

type DebtFormValues = {
  name: string;
  currency: string;
  amount: string;
};

export function DebtDialog({ debt, open, onOpenChange, year, month }: DebtDialogProps) {
  const isEditing = !!debt;

  const form = useForm<DebtFormValues>({
    defaultValues: { name: "", currency: "USD", amount: "" },
  });

  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();
  const createDebt = useCreateDebt();
  const updateItem = useUpdateNwItem();
  const upsertSnapshot = useUpsertNwSnapshot(year);

  const isPending = createDebt.isPending || updateItem.isPending || upsertSnapshot.isPending;

  useEffect(() => {
    if (!open) return;
    if (debt) {
      form.reset({
        name: debt.name,
        currency: debt.currency,
        amount: debt.currentAmount
          ? formatMoneyDisplay(String(debt.currentAmount).replace(".", ","))
          : "",
      });
    } else {
      form.reset({ name: "", currency: baseCurrency ?? "USD", amount: "" });
    }
  }, [debt, open, form, baseCurrency]);

  const onSubmit = async (values: DebtFormValues) => {
    const amount = parseMoneyInput(values.amount) ?? 0;

    // Calculate amount_base for non-base currencies
    let amountBase: number | null = null;
    if (values.currency === baseCurrency) {
      amountBase = amount;
    } else if (baseCurrency && amount !== 0) {
      try {
        const rate = await fetchExchangeRate(values.currency, baseCurrency);
        if (rate) amountBase = amount * rate;
      } catch {
        // If FX fails, leave null — server will convert on read
      }
    }

    try {
      if (isEditing) {
        await updateItem.mutateAsync({
          id: debt.id,
          name: values.name,
          currency: values.currency,
        });
        await upsertSnapshot.mutateAsync({
          nw_item_id: debt.id,
          year,
          month,
          amount,
          amount_base: amountBase,
        });
      } else {
        const result = await createDebt.mutateAsync({
          name: values.name,
          currency: values.currency,
          account_id: null,
          display_order: 0,
        });
        await upsertSnapshot.mutateAsync({
          nw_item_id: result.id,
          year,
          month,
          amount,
          amount_base: amountBase,
        });
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const fiatCurrencies = currencies?.filter((c) => c.currency_type === "fiat") ?? [];
  const cryptoCurrencies = currencies?.filter((c) => c.currency_type === "crypto") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar deuda" : "Nueva deuda"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de tu deuda."
              : "Agregá una nueva deuda o pasivo."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Hipoteca, Préstamo personal..."
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moneda</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
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
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto actual</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) =>
                        form.setValue("amount", formatMoneyInput(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear deuda"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
