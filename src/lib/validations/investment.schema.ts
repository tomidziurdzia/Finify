import { z } from "zod";
import { ASSET_TYPES } from "@/types/investments";

export const CreateInvestmentSchema = z.object({
  account_id: z.string().uuid("Cuenta inválida"),
  asset_name: z.string().min(1, "El nombre es obligatorio").max(200),
  ticker: z.string().max(20).nullable().optional(),
  asset_type: z.enum(ASSET_TYPES),
  quantity: z.number().positive("La cantidad debe ser mayor a 0"),
  price_per_unit: z.number().positive("El precio debe ser mayor a 0"),
  total_cost: z.number().positive("El costo total debe ser mayor a 0"),
  currency: z.string().min(1, "La moneda es obligatoria"),
  purchase_date: z.string().min(1, "La fecha es obligatoria"),
  notes: z.string().max(500).nullable().optional(),
  skip_deduction: z.boolean().optional().default(false),
});

export const UpdateInvestmentSchema = CreateInvestmentSchema.partial().extend({
  id: z.string().uuid(),
});

export type CreateInvestmentInput = z.infer<typeof CreateInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof UpdateInvestmentSchema>;
