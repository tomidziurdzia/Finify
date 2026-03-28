"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateInvestmentSchema,
  TransferInvestmentPositionSchema,
  UpdateInvestmentSchema,
} from "@/lib/validations/investment.schema";
import type {
  Investment,
  InvestmentWithAccount,
  AssetType,
} from "@/types/investments";
import { fetchCryptoPrices } from "@/lib/coingecko";

type ActionResult<T> = { data: T } | { error: string };

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export async function getInvestments(): Promise<
  ActionResult<InvestmentWithAccount[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("investments")
      .select(
        `
        *,
        accounts ( name, account_type ),
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("purchase_date", { ascending: false });

    if (error) return { error: error.message };

    const mapped = (data ?? []).map((row) => {
      const accountRaw = row.accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const currencyRaw = row.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;

      return {
        id: row.id,
        user_id: row.user_id,
        account_id: row.account_id,
        asset_name: row.asset_name,
        ticker: row.ticker,
        asset_type: row.asset_type as AssetType,
        quantity: Number(row.quantity),
        price_per_unit: Number(row.price_per_unit),
        total_cost: Number(row.total_cost),
        currency: row.currency,
        purchase_date: row.purchase_date,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
        account_name: (account as { name?: string })?.name ?? "",
        account_type:
          (account as { account_type?: string })?.account_type ?? "",
        currency_symbol:
          (currency as { symbol?: string })?.symbol ?? row.currency,
      } as InvestmentWithAccount;
    });

    return { data: mapped };
  } catch {
    return { error: "Error al obtener inversiones" };
  }
}

export async function createInvestment(
  input: unknown
): Promise<ActionResult<Investment>> {
  try {
    const parsed = CreateInvestmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // Verificar que la cuenta pertenece al usuario
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("id, account_type, currency")
      .eq("id", parsed.data.account_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (accError) return { error: accError.message };
    if (!account) return { error: "Cuenta no encontrada" };

    // Crear inversión
    const { data, error } = await supabase
      .from("investments")
      .insert({
        user_id: userId,
        account_id: parsed.data.account_id,
        asset_name: parsed.data.asset_name,
        ticker: parsed.data.ticker ?? null,
        asset_type: parsed.data.asset_type,
        quantity: parsed.data.quantity,
        price_per_unit: parsed.data.price_per_unit,
        total_cost: parsed.data.total_cost,
        currency: parsed.data.currency,
        purchase_date: parsed.data.purchase_date,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();

    if (error) return { error: error.message };

    // Auto-descuento para brokers (no para crypto exchanges/wallets, ni inversiones existentes)
    if (account.account_type === "investment_broker" && !parsed.data.skip_deduction) {
      const deductionError = await autoDeductFromAccount(
        supabase,
        userId,
        parsed.data.account_id,
        account.currency,
        parsed.data.total_cost,
        parsed.data.currency,
        parsed.data.purchase_date,
        parsed.data.asset_name
      );
      if (deductionError) {
        console.warn("Auto-deduction failed:", deductionError);
      }
    }

    return {
      data: {
        ...data,
        quantity: Number(data.quantity),
        price_per_unit: Number(data.price_per_unit),
        total_cost: Number(data.total_cost),
      } as Investment,
    };
  } catch {
    return { error: "Error al crear inversión" };
  }
}

async function autoDeductFromAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  accountId: string,
  accountCurrency: string,
  totalCost: number,
  investmentCurrency: string,
  date: string,
  assetName: string
): Promise<string | null> {
  try {
    // Resolver month_id para la fecha
    const parsedDate = new Date(`${date}T00:00:00`);
    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth() + 1;

    const { data: monthRow } = await supabase
      .from("months")
      .select("id")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (!monthRow) return null; // No month exists yet, skip deduction

    // El monto se registra en la moneda de la cuenta
    const amount = -Math.abs(totalCost);
    const exchangeRate = 1;
    const baseAmount = amount; // Simplificado: asumimos misma moneda

    // Crear transacción tipo correction
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        month_id: monthRow.id,
        category_id: null,
        transaction_type: "correction",
        date,
        description: `Compra: ${assetName}`,
        notes: null,
      })
      .select()
      .single();

    if (txError) return txError.message;
    if (!tx) return "No se pudo crear la transacción de descuento";

    const { error: amountError } = await supabase.from("transaction_amounts").insert({
      transaction_id: tx.id,
      account_id: accountId,
      amount,
      original_currency: accountCurrency,
      exchange_rate: exchangeRate,
      base_amount: baseAmount,
    });

    if (amountError) {
      // Cleanup orphaned transaction
      await supabase.from("transactions").delete().eq("id", tx.id);
      return amountError.message;
    }

    return null;
  } catch (e) {
    console.error("autoDeductFromAccount:", e);
    return e instanceof Error ? e.message : "Error desconocido en auto-descuento";
  }
}

export async function updateInvestment(
  input: unknown
): Promise<ActionResult<Investment>> {
  try {
    const parsed = UpdateInvestmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { id, skip_deduction: _, ...updates } = parsed.data;
    const clean = Object.fromEntries(
      Object.entries(updates).filter(
        ([_, v]) => v !== undefined && v !== null
      )
    ) as Record<string, unknown>;

    const { data, error } = await supabase
      .from("investments")
      .update(clean)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return { error: error.message };
    return {
      data: {
        ...data,
        quantity: Number(data.quantity),
        price_per_unit: Number(data.price_per_unit),
        total_cost: Number(data.total_cost),
      } as Investment,
    };
  } catch {
    return { error: "Error al actualizar inversión" };
  }
}

export async function deleteInvestment(
  id: string
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("investments")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al eliminar inversión" };
  }
}

export async function transferInvestmentPosition(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = TransferInvestmentPositionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos invalidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, account_type")
      .in("id", [
        parsed.data.source_account_id,
        parsed.data.destination_account_id,
      ])
      .eq("user_id", userId);

    if (accountsError) return { error: accountsError.message };
    if (!accounts || accounts.length !== 2) {
      return { error: "Cuenta origen o destino no encontrada" };
    }

    const allowedTypes = new Set([
      "investment_broker",
      "crypto_exchange",
      "crypto_wallet",
    ]);
    if (accounts.some((account) => !allowedTypes.has(account.account_type))) {
      return { error: "Solo se puede mover posicion entre cuentas de inversion" };
    }

    const { data: sourceLots, error: sourceError } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", parsed.data.source_account_id)
      .eq("asset_name", parsed.data.asset_name)
      .eq("asset_type", parsed.data.asset_type)
      .eq("currency", parsed.data.currency)
      .order("purchase_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (sourceError) return { error: sourceError.message };

    const matchingLots = (sourceLots ?? []).filter(
      (lot) => (lot.ticker ?? null) === (parsed.data.ticker ?? null),
    );

    const availableQuantity = matchingLots.reduce(
      (sum, lot) => sum + Number(lot.quantity),
      0,
    );

    if (availableQuantity < parsed.data.quantity) {
      return { error: "No hay cantidad suficiente para transferir" };
    }

    let remainingQuantity = parsed.data.quantity;

    for (const lot of matchingLots) {
      if (remainingQuantity <= 0) break;

      const lotQuantity = Number(lot.quantity);
      const movedQuantity = Math.min(lotQuantity, remainingQuantity);
      const unitCost = lotQuantity > 0 ? Number(lot.total_cost) / lotQuantity : 0;
      const movedCost = Number((movedQuantity * unitCost).toFixed(8));
      const remainingLotQuantity = Number((lotQuantity - movedQuantity).toFixed(8));
      const remainingLotCost = Number((Number(lot.total_cost) - movedCost).toFixed(8));

      const { error: insertError } = await supabase.from("investments").insert({
        user_id: userId,
        account_id: parsed.data.destination_account_id,
        asset_name: lot.asset_name,
        ticker: lot.ticker,
        asset_type: lot.asset_type,
        quantity: movedQuantity,
        price_per_unit: lot.price_per_unit,
        total_cost: movedCost,
        currency: lot.currency,
        purchase_date: parsed.data.transfer_date,
        notes: parsed.data.notes ?? `Transferido desde otra cuenta`,
      });

      if (insertError) return { error: insertError.message };

      if (remainingLotQuantity <= 0.00000001) {
        const { error: deleteError } = await supabase
          .from("investments")
          .delete()
          .eq("id", lot.id)
          .eq("user_id", userId);
        if (deleteError) return { error: deleteError.message };
      } else {
        const { error: updateError } = await supabase
          .from("investments")
          .update({
            quantity: remainingLotQuantity,
            total_cost: remainingLotCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lot.id)
          .eq("user_id", userId);
        if (updateError) return { error: updateError.message };
      }

      remainingQuantity = Number((remainingQuantity - movedQuantity).toFixed(8));
    }

    return { data: null };
  } catch {
    return { error: "Error al transferir posicion" };
  }
}

/* ------------------------------------------------------------------ */
/* Precios actuales                                                     */
/* ------------------------------------------------------------------ */

export async function fetchCurrentPrices(
  tickers: { ticker: string; assetType: string }[],
  baseCurrency: string
): Promise<ActionResult<Record<string, number>>> {
  try {
    const prices: Record<string, number> = {};

    // Separar por tipo
    const cryptoTickers = tickers
      .filter((t) => t.assetType === "crypto")
      .map((t) => t.ticker);
    const stockTickers = tickers
      .filter((t) => t.assetType !== "crypto")
      .map((t) => t.ticker);

    // Crypto: CoinGecko
    if (cryptoTickers.length > 0) {
      const cryptoPrices = await fetchCryptoPrices(
        cryptoTickers,
        baseCurrency
      );
      for (const [code, price] of Object.entries(cryptoPrices)) {
        prices[code] = price;
      }
    }

    // Stocks/ETFs: yahoo-finance2
    if (stockTickers.length > 0) {
      try {
        const yahooFinance = await import("yahoo-finance2");
        const yf = yahooFinance.default;

        for (const ticker of stockTickers) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quote: any = await yf.quote(ticker);
            if (quote && typeof quote.regularMarketPrice === "number") {
              prices[ticker] = quote.regularMarketPrice;
            }
          } catch {
            // Ticker no encontrado, continuar con los demás
          }
        }
      } catch {
        // yahoo-finance2 no disponible
      }
    }

    return { data: prices };
  } catch {
    return { error: "Error al obtener precios actuales" };
  }
}
