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
  NwYearSummary,
  NwSnapshot,
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
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

export async function getNwSnapshotsForYear(
  year: number
): Promise<ActionResult<NwYearSummary>> {
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
    let snapshots: {
      nw_item_id: string;
      month: number;
      amount: number;
      amount_base: number | null;
    }[] = [];

    if (itemIds.length > 0) {
      // Fetch ALL snapshots for this year, then pick the latest month per item
      const { data: snap, error: snapError } = await supabase
        .from("nw_snapshots")
        .select("nw_item_id, month, amount, amount_base")
        .in("nw_item_id", itemIds)
        .eq("year", year)
        .order("month", { ascending: false });

      if (snapError) return { error: snapError.message };
      snapshots = (snap ?? []).map((s) => ({
        nw_item_id: s.nw_item_id,
        month: s.month,
        amount: Number(s.amount),
        amount_base: s.amount_base != null ? Number(s.amount_base) : null,
      }));
    }

    // Keep only the latest month snapshot per item
    const snapByItem = new Map<
      string,
      { month: number; amount: number; amount_base: number | null }
    >();
    for (const s of snapshots) {
      if (!snapByItem.has(s.nw_item_id)) {
        snapByItem.set(s.nw_item_id, s);
      }
    }

    let totalAssets = 0;
    let totalLiabilities = 0;

    const summaryItems = (items ?? []).map((item) => {
      const snap = snapByItem.get(item.id);
      const amount = snap?.amount ?? 0;
      const amountBase = snap?.amount_base ?? null;
      const snapshotMonth = snap?.month ?? 0;
      const currencyRaw = item.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;
      const symbol =
        (currency as { symbol?: string })?.symbol ?? item.currency;

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
        snapshot_month: snapshotMonth,
        currency: item.currency,
        currency_symbol: symbol,
      };
    });

    return {
      data: {
        year,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        items: summaryItems,
      },
    };
  } catch {
    return { error: "Error al obtener snapshots anuales de patrimonio" };
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

/* ------------------------------------------------------------------ */
/* Patrimonio neto automático — calculado desde saldos de cuentas      */
/* ------------------------------------------------------------------ */

export async function getAccountNetWorth(
  year: number
): Promise<ActionResult<AccountNetWorthSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // 1. Encontrar el último mes del año seleccionado
    const { data: latestMonth, error: monthError } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", userId)
      .eq("year", year)
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (monthError) return { error: monthError.message };

    if (!latestMonth) {
      return {
        data: { year, month: 0, total: 0, accounts: [] },
      };
    }

    // 2. Obtener cuentas activas con símbolo de moneda
    const { data: accounts, error: accError } = await supabase
      .from("accounts")
      .select(
        `
        id, name, account_type, currency, is_active,
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("account_type")
      .order("name");

    if (accError) return { error: accError.message };

    // 3. Opening balances para ese mes
    const { data: openings, error: obError } = await supabase
      .from("opening_balances")
      .select("account_id, opening_amount, opening_base_amount")
      .eq("month_id", latestMonth.id);

    if (obError) return { error: obError.message };

    // 4. Transacciones del mes → sumar montos por cuenta
    const { data: txRows, error: txError } = await supabase
      .from("transactions")
      .select("transaction_amounts ( account_id, amount, base_amount )")
      .eq("month_id", latestMonth.id)
      .eq("user_id", userId);

    if (txError) return { error: txError.message };

    // Acumular movimientos por account_id
    const movByAccount = new Map<
      string,
      { amount: number; base_amount: number }
    >();
    for (const tx of txRows ?? []) {
      const lines = Array.isArray(tx.transaction_amounts)
        ? tx.transaction_amounts
        : tx.transaction_amounts
          ? [tx.transaction_amounts]
          : [];
      for (const line of lines) {
        const cur = movByAccount.get(line.account_id) ?? {
          amount: 0,
          base_amount: 0,
        };
        cur.amount += Number(line.amount);
        cur.base_amount += Number(line.base_amount);
        movByAccount.set(line.account_id, cur);
      }
    }

    // 5. Opening balances por cuenta
    const obByAccount = new Map<
      string,
      { opening: number; opening_base: number }
    >();
    for (const ob of openings ?? []) {
      obByAccount.set(ob.account_id, {
        opening: Number(ob.opening_amount),
        opening_base: Number(ob.opening_base_amount),
      });
    }

    // 6. Calcular saldo de cierre por cuenta
    let total = 0;
    const accountResults = (accounts ?? []).map((acc) => {
      const ob = obByAccount.get(acc.id) ?? { opening: 0, opening_base: 0 };
      const mov = movByAccount.get(acc.id) ?? { amount: 0, base_amount: 0 };

      const balance = ob.opening + mov.amount;
      const balanceBase = ob.opening_base + mov.base_amount;

      total += balanceBase;

      const currencyRaw = acc.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;
      const symbol =
        (currency as { symbol?: string })?.symbol ?? acc.currency;

      return {
        id: acc.id,
        name: acc.name,
        account_type: acc.account_type,
        currency: acc.currency,
        currency_symbol: symbol,
        balance,
        balance_base: balanceBase,
      };
    });

    return {
      data: {
        year,
        month: latestMonth.month,
        total,
        accounts: accountResults,
      },
    };
  } catch {
    return { error: "Error al calcular patrimonio neto" };
  }
}

/* ------------------------------------------------------------------ */
/* Pasivos — último snapshot de cada deuda para un año                  */
/* ------------------------------------------------------------------ */

export async function getLiabilitiesForYear(
  year: number
): Promise<ActionResult<LiabilitiesSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    const { data: items, error: itemsError } = await supabase
      .from("nw_items")
      .select("id, name, currency, currencies ( symbol )")
      .eq("user_id", userId)
      .eq("side", "liability")
      .order("name");

    if (itemsError) return { error: itemsError.message };

    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length === 0) {
      return { data: { year, total: 0, items: [] } };
    }

    const { data: snaps, error: snapError } = await supabase
      .from("nw_snapshots")
      .select("nw_item_id, month, amount, amount_base")
      .in("nw_item_id", itemIds)
      .eq("year", year)
      .order("month", { ascending: false });

    if (snapError) return { error: snapError.message };

    // Último snapshot por ítem
    const latestByItem = new Map<
      string,
      { amount: number; amount_base: number | null }
    >();
    for (const s of snaps ?? []) {
      if (!latestByItem.has(s.nw_item_id)) {
        latestByItem.set(s.nw_item_id, {
          amount: Number(s.amount),
          amount_base: s.amount_base != null ? Number(s.amount_base) : null,
        });
      }
    }

    let total = 0;
    const summaryItems = (items ?? []).map((item) => {
      const snap = latestByItem.get(item.id);
      const amount = snap?.amount ?? 0;
      const amountBase = snap?.amount_base ?? null;
      const currencyRaw = item.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;
      const symbol =
        (currency as { symbol?: string })?.symbol ?? item.currency;

      total += amountBase ?? amount;

      return {
        item_id: item.id,
        name: item.name,
        currency: item.currency,
        currency_symbol: symbol,
        amount,
        amount_base: amountBase,
      };
    });

    return { data: { year, total, items: summaryItems } };
  } catch {
    return { error: "Error al obtener pasivos" };
  }
}

/* ------------------------------------------------------------------ */
/* Evolución mensual del patrimonio neto                               */
/* ------------------------------------------------------------------ */

export async function getNetWorthEvolution(
  year: number
): Promise<ActionResult<NetWorthEvolutionPoint[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // 1. Obtener todos los meses del año
    const { data: monthRows, error: monthsError } = await supabase
      .from("months")
      .select("id, month")
      .eq("user_id", userId)
      .eq("year", year)
      .order("month");

    if (monthsError) return { error: monthsError.message };
    if (!monthRows || monthRows.length === 0) return { data: [] };

    const monthIds = monthRows.map((m) => m.id);

    // 2. Fetch accounts, liabilities and their snapshots in parallel
    const [accountsRes, liabilityItemsRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true),
      supabase
        .from("nw_items")
        .select("id")
        .eq("user_id", userId)
        .eq("side", "liability"),
    ]);

    const accountIds = (accountsRes.data ?? []).map((a) => a.id);
    const liabilityIds = (liabilityItemsRes.data ?? []).map((i) => i.id);

    // 3. Batch fetch ALL openings + transactions + liability snapshots for the year
    const [allOpeningsRes, allTxRes, liabilitySnapsRes] = await Promise.all([
      accountIds.length > 0
        ? supabase
            .from("opening_balances")
            .select("month_id, account_id, opening_base_amount")
            .in("month_id", monthIds)
        : Promise.resolve({ data: [] as { month_id: string; account_id: string; opening_base_amount: number }[] }),
      accountIds.length > 0
        ? supabase
            .from("transactions")
            .select("month_id, transaction_amounts ( account_id, base_amount )")
            .in("month_id", monthIds)
            .eq("user_id", userId)
        : Promise.resolve({ data: [] as any[] }),
      liabilityIds.length > 0
        ? supabase
            .from("nw_snapshots")
            .select("nw_item_id, month, amount, amount_base")
            .in("nw_item_id", liabilityIds)
            .eq("year", year)
            .order("month")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // 4. Group openings by month_id
    const openingsByMonth = new Map<string, number>();
    for (const ob of (allOpeningsRes.data ?? []) as any[]) {
      const key = ob.month_id as string;
      openingsByMonth.set(key, (openingsByMonth.get(key) ?? 0) + Number(ob.opening_base_amount));
    }

    // 5. Group transaction base_amounts by month_id
    const txByMonth = new Map<string, number>();
    for (const tx of (allTxRes.data ?? []) as any[]) {
      const monthId = tx.month_id as string;
      const lines = Array.isArray(tx.transaction_amounts)
        ? tx.transaction_amounts
        : tx.transaction_amounts
          ? [tx.transaction_amounts]
          : [];
      for (const line of lines) {
        txByMonth.set(monthId, (txByMonth.get(monthId) ?? 0) + Number(line.base_amount));
      }
    }

    // 6. Pre-process liability snapshots into Map<itemId, Map<month, value>>
    const liabilitySnapsByItem = new Map<string, { month: number; value: number }[]>();
    for (const s of (liabilitySnapsRes.data ?? []) as any[]) {
      const itemId = s.nw_item_id as string;
      const value = s.amount_base != null ? Number(s.amount_base) : Number(s.amount);
      if (!liabilitySnapsByItem.has(itemId)) {
        liabilitySnapsByItem.set(itemId, []);
      }
      liabilitySnapsByItem.get(itemId)!.push({ month: s.month, value });
    }

    // 7. Calculate points for each month (no DB calls in loop)
    const points: NetWorthEvolutionPoint[] = [];

    for (const m of monthRows) {
      const assets = (openingsByMonth.get(m.id) ?? 0) + (txByMonth.get(m.id) ?? 0);

      let liabilities = 0;
      for (const itemId of liabilityIds) {
        const snaps = liabilitySnapsByItem.get(itemId);
        if (!snaps) continue;
        // snaps are sorted by month asc, find last one <= m.month
        let latest: { month: number; value: number } | undefined;
        for (const snap of snaps) {
          if (snap.month <= m.month) latest = snap;
          else break;
        }
        if (latest) liabilities += latest.value;
      }

      points.push({
        month: m.month,
        assets,
        liabilities,
        netWorth: assets - liabilities,
      });
    }

    return { data: points };
  } catch {
    return { error: "Error al calcular evolución de patrimonio" };
  }
}
