import { z } from "zod/v4";
import { TRANSACTION_TYPES } from "@/types/transactions";

export const CreateTransactionSchema = z
  .object({
    date: z.string().min(1, "La fecha es obligatoria"),
    transaction_type: z.enum(TRANSACTION_TYPES, {
      error: "Tipo de transacción no válido",
    }),
    account_id: z.string().uuid("Cuenta no válida"),
    category_id: z
      .string()
      .uuid("Categoría no válida")
      .nullable()
      .optional()
      .transform((v) => v || null),
    description: z
      .string()
      .min(1, "La descripción es obligatoria")
      .max(200, "Máximo 200 caracteres")
      .trim(),
    amount: z.number().positive("El monto debe ser mayor a 0"),
    exchange_rate: z
      .number()
      .positive("El tipo de cambio debe ser mayor a 0")
      .default(1),
    base_amount: z.number().positive("El monto base debe ser mayor a 0"),
    notes: z
      .string()
      .max(500, "Las notas no pueden superar 500 caracteres")
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((v) => v || null),
  })
  .refine(
    (data) => {
      if (
        data.transaction_type === "income" ||
        data.transaction_type === "expense"
      ) {
        return data.category_id != null;
      }
      return true;
    },
    {
      message: "La categoría es obligatoria para ingresos y gastos",
      path: ["category_id"],
    }
  );

export const CreateTransferSchema = z
  .object({
    date: z.string().min(1, "La fecha es obligatoria"),
    source_account_id: z.string().uuid("Cuenta origen no válida"),
    destination_account_id: z.string().uuid("Cuenta destino no válida"),
    description: z
      .string()
      .min(1, "La descripción es obligatoria")
      .max(200, "Máximo 200 caracteres")
      .trim(),
    amount: z.number().positive("El monto debe ser mayor a 0"),
    exchange_rate: z
      .number()
      .positive("El tipo de cambio debe ser mayor a 0")
      .default(1),
    base_amount: z.number().positive("El monto base debe ser mayor a 0"),
    notes: z
      .string()
      .max(500, "Las notas no pueden superar 500 caracteres")
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((v) => v || null),
  })
  .refine(
    (data) => data.source_account_id !== data.destination_account_id,
    {
      message: "La cuenta origen y destino deben ser diferentes",
      path: ["destination_account_id"],
    }
  );

export const UpdateTransactionSchema = z.object({
  id: z.string().uuid("ID de transacción no válido"),
  date: z.string().min(1).optional(),
  category_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v || null),
  description: z.string().min(1).max(200).trim().optional(),
  amount: z.number().positive().optional(),
  exchange_rate: z.number().positive().optional(),
  base_amount: z.number().positive().optional(),
  notes: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type CreateTransferInput = z.infer<typeof CreateTransferSchema>;
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
