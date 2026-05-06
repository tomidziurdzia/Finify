"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { format } from "date-fns";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useSellInvestment } from "@/hooks/useInvestments";
import { useAccounts } from "@/hooks/useAccounts";
import { formatAmount, amountTone } from "@/lib/format";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import type { HoldingPosition } from "@/types/investments";

type FormValues = {
  quantity_sold: string;
  price_per_unit: string;
  fees: string;
  tax: string;
  sale_date: string;
  notes: string;
  skip_credit: boolean;
};

interface SellInvestmentDialogProps {
  holding: HoldingPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SellInvestmentDialog({
  holding,
  open,
  onOpenChange,
}: SellInvestmentDialogProps) {
  const sellMutation = useSellInvestment();
  const { data: accounts } = useAccounts();
  const isPending = sellMutation.isPending;

  const form = useForm<FormValues>({
    defaultValues: {
      quantity_sold: "",
      price_per_unit: "",
      fees: "",
      tax: "",
      sale_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      skip_credit: false,
    },
  });

  const account = useMemo(
    () => accounts?.find((a) => a.id === holding?.account_id),
    [accounts, holding?.account_id],
  );

  const isBroker = account?.account_type === "investment_broker";

  useEffect(() => {
    if (!open || !holding) return;
    form.reset({
      quantity_sold: "",
      price_per_unit: holding.current_price
        ? String(holding.current_price).replace(".", ",")
        : "",
      fees: "",
      tax: "",
      sale_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      skip_credit: false,
    });
  }, [holding, open, form]);

  const watchedQty = useWatch({ control: form.control, name: "quantity_sold" });
  const watchedPrice = useWatch({ control: form.control, name: "price_per_unit" });
  const watchedFees = useWatch({ control: form.control, name: "fees" });
  const watchedTax = useWatch({ control: form.control, name: "tax" });
  const watchedSkipCredit = useWatch({
    control: form.control,
    name: "skip_credit",
  });

  const preview = useMemo(() => {
    if (!holding) return null;
    const qty = parseNumberInput(watchedQty);
    const price = parseNumberInput(watchedPrice);
    const fees = parseNumberInput(watchedFees) ?? 0;
    const tax = parseNumberInput(watchedTax) ?? 0;
    if (!qty || !price || qty <= 0 || price <= 0) return null;

    const grossProceeds = qty * price;
    const costBasis = qty * holding.avg_cost_per_unit;
    const realizedPnl = grossProceeds - fees - tax - costBasis;
    const netProceeds = grossProceeds - fees - tax;

    return { grossProceeds, costBasis, realizedPnl, netProceeds };
  }, [holding, watchedQty, watchedPrice, watchedFees, watchedTax]);

  const onSubmit = async (values: FormValues) => {
    if (!holding) return;
    const quantity = parseNumberInput(values.quantity_sold);
    const price = parseNumberInput(values.price_per_unit);
    const fees = parseNumberInput(values.fees) ?? 0;
    const tax = parseNumberInput(values.tax) ?? 0;

    if (!quantity || quantity <= 0) {
      form.setError("quantity_sold", { message: "Cantidad inválida" });
      return;
    }
    if (quantity > holding.total_quantity) {
      form.setError("quantity_sold", {
        message: `Máximo disponible: ${formatAmount(holding.total_quantity)}`,
      });
      return;
    }
    if (!price || price <= 0) {
      form.setError("price_per_unit", { message: "Precio inválido" });
      return;
    }

    try {
      await sellMutation.mutateAsync({
        account_id: holding.account_id,
        asset_name: holding.asset_name,
        ticker: holding.ticker || null,
        isin: holding.isin || null,
        asset_type: holding.asset_type,
        currency: holding.currency,
        quantity_sold: quantity,
        price_per_unit: price,
        fees,
        tax,
        sale_date: values.sale_date,
        notes: values.notes || null,
        skip_credit: values.skip_credit,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  const sellAll = () => {
    if (!holding) return;
    form.setValue(
      "quantity_sold",
      formatNumberInput(String(holding.total_quantity).replace(".", ",")),
    );
  };

  if (!holding) return null;

  const sym = holding.currency_symbol;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vender {holding.asset_name}</DialogTitle>
          <DialogDescription>
            Posición disponible: {formatAmount(holding.total_quantity)} unidades
            • Costo prom: {sym} {formatAmount(holding.avg_cost_per_unit)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity_sold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between">
                      <span>Cantidad a vender</span>
                      <button
                        type="button"
                        onClick={sellAll}
                        className="text-xs text-primary hover:underline"
                      >
                        Vender todo
                      </button>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "quantity_sold",
                            formatNumberInput(e.target.value, 7),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de venta</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "price_per_unit",
                            formatNumberInput(e.target.value, 7),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="fees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisiones</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "fees",
                            formatNumberInput(e.target.value, 4),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impuestos</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "tax",
                            formatNumberInput(e.target.value, 4),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sale_date"
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
            </div>

            {preview && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Producido bruto
                  </span>
                  <span>
                    {sym} {formatAmount(preview.grossProceeds)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Costo base (promedio)
                  </span>
                  <span>
                    {sym} {formatAmount(preview.costBasis)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Producido neto</span>
                  <span>
                    {sym} {formatAmount(preview.netProceeds)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Ganancia / Pérdida</span>
                  <span className={amountTone(preview.realizedPnl)}>
                    {sym} {formatAmount(preview.realizedPnl)}
                  </span>
                </div>
              </div>
            )}

            {isBroker && (
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="skip_credit"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        No acreditar el producido en la cuenta del broker
                      </FormLabel>
                    </FormItem>
                  )}
                />
                {!watchedSkipCredit && (
                  <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      El producido neto se acreditará en la cuenta del broker
                      automáticamente.
                    </span>
                  </div>
                )}
              </div>
            )}

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
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Registrando..." : "Registrar venta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
