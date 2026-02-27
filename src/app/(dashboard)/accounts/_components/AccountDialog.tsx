"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import type { z } from "zod";

interface AccountDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AccountFormValues = z.infer<typeof CreateAccountSchema>;

export function AccountDialog({
  account,
  open,
  onOpenChange,
}: AccountDialogProps) {
  const isEditing = !!account;

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(CreateAccountSchema),
    defaultValues: {
      name: "",
      account_type: "bank",
      currency: "USD",
      notes: "",
    },
  });

  const { data: currencies } = useCurrencies();
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (account) {
      form.reset({
        name: account.name,
        account_type: account.account_type,
        currency: account.currency,
        notes: account.notes ?? "",
      });
    } else {
      form.reset({
        name: "",
        account_type: "bank",
        currency: "USD",
        notes: "",
      });
    }
  }, [account, open, form]);

  const onSubmit = async (values: AccountFormValues) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: account.id,
          ...values,
        });
      } else {
        await createMutation.mutateAsync(values);
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
                      placeholder="Ej: ING, N26, Nexo..."
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
              name="account_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de cuenta</FormLabel>
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
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {ACCOUNT_TYPE_LABELS[type]}
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
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
