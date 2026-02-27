import { z } from "zod/v4";
import { NW_ITEM_SIDES } from "@/types/net-worth";

export const CreateNwItemSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(120, "Máximo 120 caracteres")
    .trim(),
  side: z.enum(NW_ITEM_SIDES, { message: "Elegí Activo o Pasivo" }),
  account_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  currency: z.string().min(1, "Moneda requerida"),
  display_order: z.number().int().min(0).optional().default(0),
});

export const UpdateNwItemSchema = z.object({
  id: z.string().uuid("Ítem no válido"),
  name: z
    .string()
    .min(1, "El nombre es obligatorio")
    .max(120, "Máximo 120 caracteres")
    .trim()
    .optional(),
  side: z.enum(NW_ITEM_SIDES).optional(),
  account_id: z.string().uuid().nullable().optional(),
  currency: z.string().min(1).optional(),
  display_order: z.number().int().min(0).optional(),
});

export const UpsertNwSnapshotSchema = z.object({
  nw_item_id: z.string().uuid("Ítem no válido"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number("Monto inválido"),
  amount_base: z.number().nullable().optional(),
});

export type CreateNwItemInput = z.infer<typeof CreateNwItemSchema>;
export type UpdateNwItemInput = z.infer<typeof UpdateNwItemSchema>;
export type UpsertNwSnapshotInput = z.infer<typeof UpsertNwSnapshotSchema>;
