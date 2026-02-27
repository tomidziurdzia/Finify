"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { NW_ITEM_SIDE_LABELS, type NwItemWithRelations } from "@/types/net-worth";

const NwItemSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").trim(),
  side: z.enum(["asset", "liability"]),
  account_id: z.string().nullable(),
  currency: z.string().min(1, "La moneda es obligatoria"),
});

type NwItemFormValues = z.infer<typeof NwItemSchema>;

interface NwItemDialogProps {
  item: NwItemWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    side: "asset" | "liability";
    account_id: string | null;
    currency: string;
  }) => Promise<void>;
}

export function NwItemDialog({
  item,
  open,
  onOpenChange,
  onSubmit,
}: NwItemDialogProps) {
  const form = useForm<NwItemFormValues>({
    resolver: zodResolver(NwItemSchema),
    defaultValues: {
      name: "",
      side: "asset",
      account_id: null,
      currency: "USD",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();

  useEffect(() => {
    if (open) {
      form.reset({
        name: item?.name ?? "",
        side: item?.side ?? "asset",
        account_id: item?.account_id ?? null,
        currency: item?.currency ?? "USD",
      });
    }
  }, [open, item, form]);

  const handleSubmit = async (values: NwItemFormValues) => {
    await onSubmit({
      name: values.name.trim(),
      side: values.side,
      account_id: values.account_id === "none" ? null : values.account_id,
      currency: values.currency,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar ítem" : "Nuevo ítem de patrimonio"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "Modificá los datos del ítem."
              : "Agregá un activo o pasivo para seguimiento."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Cuenta Banco, Préstamo Hipotecario"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="side"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset">{NW_ITEM_SIDE_LABELS.asset}</SelectItem>
                        <SelectItem value="liability">{NW_ITEM_SIDE_LABELS.liability}</SelectItem>
                      </SelectContent>
                    </Select>
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
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(currencies ?? []).map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} ({c.symbol})
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
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta asociada (opcional)</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Ninguna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ninguna</SelectItem>
                        {(accounts ?? []).map((a) => (
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

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {item ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
