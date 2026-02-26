/**
 * Fetch exchange rate from Frankfurter API (fiat currencies only).
 * https://frankfurter.dev/
 *
 * Returns the rate to convert 1 unit of `from` into `to`.
 * When `date` is provided (yyyy-MM-dd) it fetches the historical rate for that day.
 * Returns null if the request fails or the pair is unsupported.
 */
export async function fetchExchangeRate(
  from: string,
  to: string,
  date?: string
): Promise<number | null> {
  if (from === to) return 1;

  try {
    const endpoint = date ?? "latest";
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${endpoint}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
    );
    if (!res.ok) return null;

    const data: { rates: Record<string, number> } = await res.json();
    return data.rates[to] ?? null;
  } catch {
    return null;
  }
}
