import { z } from "zod/v4";
import { BUDGET_CATEGORY_TYPES, BUDGET_RULE_MODES } from "@/types/budget";

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

export const ApplyBudgetLineToMonthsSchema = z.object({
  line_id: z.string().uuid("Línea no válida"),
  start_month_id: z.string().uuid("Mes inicial no válido"),
  months_count: z
    .number()
    .int("La cantidad de meses debe ser entera")
    .min(1, "Mínimo 1 mes")
    .max(120, "Máximo 120 meses"),
  planned_amount: z.number("Monto planificado inválido"),
});

export const ApplyBudgetLineToSelectedMonthsSchema = z.object({
  line_id: z.string().uuid("Línea no válida"),
  month_ids: z
    .array(z.string().uuid("Mes no válido"))
    .min(1, "Seleccioná al menos un mes")
    .max(120, "Máximo 120 meses"),
  planned_amount: z.number("Monto planificado inválido"),
});

export const ApplyBudgetLineToCalendarMonthsSchema = z.object({
  line_id: z.string().uuid("Línea no válida"),
  year: z.number().int("Año inválido").min(2000).max(2100),
  months: z
    .array(z.number().int().min(1).max(12))
    .min(1, "Seleccioná al menos un mes")
    .max(12, "Máximo 12 meses"),
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

export const CreateOrUpdateBudgetRecurrenceRuleSchema = z
  .object({
    id: z.string().uuid("Regla no válida").optional(),
    line_id: z.string().uuid("Línea no válida"),
    start_month_id: z.string().uuid("Mes inicial no válido"),
    end_month_id: z
      .string()
      .uuid("Mes final no válido")
      .nullable()
      .optional()
      .transform((v) => v || null),
    mode: z.enum(BUDGET_RULE_MODES, {
      message: "Modo de regla no válido",
    }),
    amount: z.number("Monto inválido"),
    is_active: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      if (!data.end_month_id) return true;
      return data.start_month_id !== data.end_month_id;
    },
    {
      message: "El mes final debe ser distinto al mes inicial",
      path: ["end_month_id"],
    },
  );

export const MaterializeBudgetRecurrenceSchema = z.object({
  start_month_id: z.string().uuid("Mes inicial no válido"),
  end_month_id: z.string().uuid("Mes final no válido"),
});

export type CreateBudgetYearInput = z.infer<typeof CreateBudgetYearSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateBudgetLineInput = z.infer<typeof CreateBudgetLineSchema>;
export type UpdateBudgetLineInput = z.infer<typeof UpdateBudgetLineSchema>;
export type UpsertBudgetMonthPlanInput = z.infer<
  typeof UpsertBudgetMonthPlanSchema
>;
export type ApplyBudgetLineToMonthsInput = z.infer<
  typeof ApplyBudgetLineToMonthsSchema
>;
export type ApplyBudgetLineToSelectedMonthsInput = z.infer<
  typeof ApplyBudgetLineToSelectedMonthsSchema
>;
export type ApplyBudgetLineToCalendarMonthsInput = z.infer<
  typeof ApplyBudgetLineToCalendarMonthsSchema
>;
export type CreateBudgetNextMonthFromSourceInput = z.infer<
  typeof CreateBudgetNextMonthFromSourceSchema
>;
export type CreateOrUpdateBudgetRecurrenceRuleInput = z.infer<
  typeof CreateOrUpdateBudgetRecurrenceRuleSchema
>;
export type MaterializeBudgetRecurrenceInput = z.infer<
  typeof MaterializeBudgetRecurrenceSchema
>;
