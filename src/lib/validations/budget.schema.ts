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

export const CreateBudgetLineSchema = z.object({
  category_id: z.string().uuid("Categoría no válida"),
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(120, "Máximo 120 caracteres")
    .trim(),
  display_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export const UpdateBudgetLineSchema = z.object({
  id: z.string().uuid("Línea no válida"),
  category_id: z.string().uuid("Categoría no válida").optional(),
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(120, "Máximo 120 caracteres")
    .trim()
    .optional(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const UpsertBudgetMonthPlanSchema = z.object({
  line_id: z.string().uuid("Línea no válida"),
  month_id: z.string().uuid("Mes no válido"),
  planned_amount: z.number("Monto planificado inválido"),
});

export const CreateBudgetNextMonthFromSourceSchema = z.object({
  source_month_id: z.string().uuid("Mes origen no válido"),
  entries: z.array(
    z.object({
      category_id: z.string().uuid("Categoría no válida"),
      planned_amount: z.number("Monto planificado inválido"),
    }),
  ),
});

export type CreateBudgetYearInput = z.infer<typeof CreateBudgetYearSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateBudgetLineInput = z.infer<typeof CreateBudgetLineSchema>;
export type UpdateBudgetLineInput = z.infer<typeof UpdateBudgetLineSchema>;
export type UpsertBudgetMonthPlanInput = z.infer<
  typeof UpsertBudgetMonthPlanSchema
>;
export type CreateBudgetNextMonthFromSourceInput = z.infer<
  typeof CreateBudgetNextMonthFromSourceSchema
>;
