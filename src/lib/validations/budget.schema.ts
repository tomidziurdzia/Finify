import { z } from "zod/v4";
import { BUDGET_CATEGORY_TYPES } from "@/types/budget";

export const CreateBudgetYearSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

export const CreateCategorySchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres")
    .trim(),
  category_type: z.enum(BUDGET_CATEGORY_TYPES, {
    message: "Elegí un tipo de movimiento",
  }),
  monthly_amount: z.number().min(0, "El monto no puede ser negativo"),
  display_order: z.number().int().min(0).optional().default(0),
});

export const UpdateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres")
    .trim()
    .optional(),
  category_type: z.enum(BUDGET_CATEGORY_TYPES).optional(),
  monthly_amount: z.number().min(0, "El monto no puede ser negativo").optional(),
  display_order: z.number().int().min(0).optional(),
});

export type CreateBudgetYearInput = z.infer<typeof CreateBudgetYearSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
