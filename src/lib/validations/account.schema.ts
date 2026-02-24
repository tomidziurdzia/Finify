import { z } from "zod/v4";
import { ACCOUNT_TYPES } from "@/types/accounts";

export const CreateAccountSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "El nombre no puede superar 100 caracteres")
    .trim(),
  account_type: z.enum(ACCOUNT_TYPES, {
    error: "Tipo de cuenta no válido",
  }),
  currency: z.string().min(1, "La moneda es obligatoria"),
  notes: z
    .string()
    .max(500, "Las notas no pueden superar 500 caracteres")
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export const UpdateAccountSchema = CreateAccountSchema.partial().extend({
  id: z.string().uuid("ID de cuenta no válido"),
  is_active: z.boolean().optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
