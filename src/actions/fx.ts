"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchExchangeRate } from "@/lib/frankfurter";

type ActionResult<T> = { data: T } | { error: string };

interface FxInput {
  date: string; // yyyy-MM-dd
  from: string;
  to: string;
  source?: string;
}

export async function getOrFetchFxRate(
  input: FxInput,
): Promise<ActionResult<number>> {
  const { date, from, to } = input;
  const source = input.source ?? "frankfurter";

  if (!date) return { error: "Fecha de FX requerida" };
  if (!from || !to) return { error: "Monedas de FX requeridas" };
  if (from === to) return { data: 1 };

  try {
    const supabase = await createClient();

    // 1) Intentar leer de caché local (fx_rates)
    const { data, error } = await supabase
      .from("fx_rates")
      .select("rate")
      .eq("rate_date", date)
      .eq("from_currency", from)
      .eq("to_currency", to)
      .eq("source", source)
      .maybeSingle();

    if (error) return { error: error.message };
    if (data?.rate != null) {
      return { data: Number(data.rate) };
    }

    // 2) Si no existe, ir a Frankfurter y guardar
    const fetched = await fetchExchangeRate(from, to, date);
    if (fetched == null) {
      return { error: "No se pudo obtener tipo de cambio histórico" };
    }

    const { error: insertError } = await supabase.from("fx_rates").insert({
      rate_date: date,
      from_currency: from,
      to_currency: to,
      rate: fetched,
      source,
    });

    if (insertError) {
      // No cortamos el flujo si el insert falla; igualmente devolvemos el rate
      console.error("Error al guardar fx_rate:", insertError);
    }

    return { data: fetched };
  } catch (e) {
    console.error("getOrFetchFxRate:", e);
    return { error: "Error al obtener tipo de cambio histórico" };
  }
}

