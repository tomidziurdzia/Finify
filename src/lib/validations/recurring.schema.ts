import { z } from "zod/v4";
import { RECURRENCE_OPTIONS } from "@/types/recurring";

export const CreateRecurringSchema = z.object({
  description: z
    .string()
    .min(1, "La descripción es obligatoria")
    .max(200, "Máximo 200 caracteres")
    .trim(),
  type: z.enum(["income", "expense"], {
    message: "Elegí ingreso o gasto",
  }),
  category_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  account_id: z.string().uuid("Cuenta inválida"),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  currency: z.string().min(1, "La moneda es obligatoria"),
  exchange_rate: z.number().positive().nullable().optional(),
  base_amount: z.number().nullable().optional(),
  recurrence: z.enum(RECURRENCE_OPTIONS, {
    message: "Elegí una frecuencia",
  }),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  start_date: z.string().min(1, "La fecha de inicio es obligatoria"),
  end_date: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  notes: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const UpdateRecurringSchema = CreateRecurringSchema.partial().extend({
  id: z.string().uuid(),
});

export type CreateRecurringInput = z.infer<typeof CreateRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof UpdateRecurringSchema>;
