import { z } from "zod/v4";

export const accountTypes = [
  "bank",
  "investment_broker",
  "crypto_exchange",
  "crypto_wallet",
  "cash",
  "other",
] as const;

export const accountTypeLabels: Record<(typeof accountTypes)[number], string> = {
  bank: "Banco",
  investment_broker: "Broker de inversiones",
  crypto_exchange: "Exchange crypto",
  crypto_wallet: "Wallet crypto",
  cash: "Efectivo",
  other: "Otro",
};

export const CreateAccountSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  account_type: z.enum(accountTypes),
  currency: z.string().min(1, "La moneda es obligatoria"),
  notes: z.string().max(500).optional(),
});

export const UpdateAccountSchema = CreateAccountSchema.partial().extend({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
