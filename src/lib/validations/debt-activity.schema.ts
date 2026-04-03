import { z } from "zod/v4";

export const RecordDebtPaymentSchema = z.object({
  nw_item_id: z.string().uuid("Deuda no válida"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  amount: z.number().positive("El monto debe ser positivo"),
  amount_base: z.number().nullable().optional(),
  account_id: z.string().uuid("Cuenta no válida"),
  category_id: z.string().uuid("Categoría no válida"),
  description: z
    .string()
    .min(1, "La descripción es obligatoria")
    .max(200, "Máximo 200 caracteres")
    .trim(),
});

export const RecordDebtAdjustmentSchema = z.object({
  nw_item_id: z.string().uuid("Deuda no válida"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  amount: z.number().positive("El monto debe ser positivo"),
  amount_base: z.number().nullable().optional(),
  activity_type: z.enum(["interest", "adjustment"] as const, {
    message: "Tipo de actividad no válido",
  }),
  description: z.string().max(200, "Máximo 200 caracteres").trim().optional(),
});

export type RecordDebtPaymentInput = z.infer<typeof RecordDebtPaymentSchema>;
export type RecordDebtAdjustmentInput = z.infer<typeof RecordDebtAdjustmentSchema>;
