"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateNwItemSchema,
  UpdateNwItemSchema,
  UpsertNwSnapshotSchema,
} from "@/lib/validations/net-worth.schema";
import type {
  NwItem,
  NwItemWithRelations,
  NwMonthSummary,
  NwSnapshot,
} from "@/types/net-worth";

type ActionResult<T> = { data: T } | { error: string };

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getNwItems(): Promise<
  ActionResult<NwItemWithRelations[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nw_items")
      .select(
        `
        id, user_id, name, side, account_id, currency, display_order, created_at, updated_at,
        accounts ( name ),
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("side", { ascending: true })
      .order("name", { ascending: true });

    if (error) return { error: error.message };

    const mapped = (data ?? []).map((row) => {
      const accountRaw = row.accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const currencyRaw = row.currencies;
      const currency = Array.isArray(currencyRaw) ? currencyRaw[0] : currencyRaw;
      return {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        side: row.side,
        account_id: row.account_id,
        currency: row.currency,
        display_order: row.display_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
        account_name: (account as { name?: string })?.name ?? null,
        currency_symbol: (currency as { symbol?: string })?.symbol ?? row.currency,
      } as NwItemWithRelations;
    });

    return { data: mapped };
  } catch {
    return { error: "Error al obtener ítems de patrimonio" };
  }
}

export async function createNwItem(
  input: unknown
): Promise<ActionResult<NwItem>> {
  try {
    const parsed = CreateNwItemSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nw_items")
      .insert({
        user_id: userId,
        name: parsed.data.name,
        side: parsed.data.side,
        account_id: parsed.data.account_id,
        currency: parsed.data.currency,
        display_order: parsed.data.display_order,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: data as NwItem };
  } catch {
    return { error: "Error al crear ítem de patrimonio" };
  }
}

export async function updateNwItem(
  input: unknown
): Promise<ActionResult<NwItem>> {
  try {
    const parsed = UpdateNwItemSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const payload = { ...parsed.data, id: undefined };
    const clean = Object.fromEntries(
      Object.entries(payload).filter(
        ([_, v]) => v !== undefined && v !== null
      )
    ) as Record<string, unknown>;

    const { data, error } = await supabase
      .from("nw_items")
      .update(clean)
      .eq("id", parsed.data.id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: data as NwItem };
  } catch {
    return { error: "Error al actualizar ítem de patrimonio" };
  }
}

export async function deleteNwItem(id: string): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("nw_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al eliminar ítem de patrimonio" };
  }
}

export async function getNwSnapshotsForMonth(
  year: number,
  month: number
): Promise<ActionResult<NwMonthSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: items, error: itemsError } = await supabase
      .from("nw_items")
      .select(
        `
        id, name, side, currency,
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("side", { ascending: true })
      .order("name", { ascending: true });

    if (itemsError) return { error: itemsError.message };

    const itemIds = (items ?? []).map((i) => i.id);
    let snapshots: { nw_item_id: string; amount: number; amount_base: number | null }[] = [];

    if (itemIds.length > 0) {
      const { data: snap, error: snapError } = await supabase
        .from("nw_snapshots")
        .select("nw_item_id, amount, amount_base")
        .in("nw_item_id", itemIds)
        .eq("year", year)
        .eq("month", month);

      if (snapError) return { error: snapError.message };
      snapshots = (snap ?? []).map((s) => ({
        nw_item_id: s.nw_item_id,
        amount: Number(s.amount),
        amount_base: s.amount_base != null ? Number(s.amount_base) : null,
      }));
    }

    const snapByItem = new Map(
      snapshots.map((s) => [s.nw_item_id, s])
    );

    let totalAssets = 0;
    let totalLiabilities = 0;

    const summaryItems = (items ?? []).map((item) => {
      const snap = snapByItem.get(item.id);
      const amount = snap?.amount ?? 0;
      const amountBase = snap?.amount_base ?? null;
      const currencyRaw = item.currencies;
      const currency = Array.isArray(currencyRaw) ? currencyRaw[0] : currencyRaw;
      const symbol = (currency as { symbol?: string })?.symbol ?? item.currency;

      const valueForTotal = amountBase ?? amount;
      if (item.side === "asset") {
        totalAssets += valueForTotal;
      } else {
        totalLiabilities += valueForTotal;
      }

      return {
        item_id: item.id,
        item_name: item.name,
        side: item.side,
        amount,
        amount_base: amountBase,
        currency: item.currency,
        currency_symbol: symbol,
      };
    });

    return {
      data: {
        year,
        month,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        items: summaryItems,
      },
    };
  } catch {
    return { error: "Error al obtener snapshots de patrimonio" };
  }
}

export async function upsertNwSnapshot(
  input: unknown
): Promise<ActionResult<NwSnapshot>> {
  try {
    const parsed = UpsertNwSnapshotSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: item, error: itemError } = await supabase
      .from("nw_items")
      .select("id")
      .eq("id", parsed.data.nw_item_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (itemError) return { error: itemError.message };
    if (!item) return { error: "Ítem de patrimonio no encontrado" };

    const payload = {
      nw_item_id: parsed.data.nw_item_id,
      year: parsed.data.year,
      month: parsed.data.month,
      amount: parsed.data.amount,
      amount_base: parsed.data.amount_base ?? null,
    };

    const { data, error } = await supabase
      .from("nw_snapshots")
      .upsert(payload, { onConflict: "nw_item_id,year,month" })
      .select()
      .single();

    if (error) return { error: error.message };
    return {
      data: {
        ...data,
        amount: Number(data.amount),
        amount_base: data.amount_base != null ? Number(data.amount_base) : null,
      } as NwSnapshot,
    };
  } catch {
    return { error: "Error al guardar snapshot de patrimonio" };
  }
}
