import { z } from "zod/v4";
import { MATCH_FIELDS, MATCH_TYPES } from "@/types/transaction-rules";

export const CreateTransactionRuleSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres")
    .trim(),
  match_field: z.enum(MATCH_FIELDS, {
    message: "Elegí un campo para buscar",
  }),
  match_type: z.enum(MATCH_TYPES, {
    message: "Elegí un tipo de coincidencia",
  }),
  match_value: z
    .string()
    .min(1, "El valor de búsqueda es obligatorio")
    .max(200)
    .trim(),
  action_category_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  action_rename: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v || null),
  priority: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export const UpdateTransactionRuleSchema =
  CreateTransactionRuleSchema.partial().extend({
    id: z.string().uuid(),
  });

export type CreateTransactionRuleInput = z.infer<
  typeof CreateTransactionRuleSchema
>;
export type UpdateTransactionRuleInput = z.infer<
  typeof UpdateTransactionRuleSchema
>;
