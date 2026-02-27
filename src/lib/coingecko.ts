"use client";

// Mapa simple de códigos de moneda a IDs de CoinGecko.
// Se puede ampliar con más símbolos si hace falta.
const CODE_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
};

export type CryptoPriceMap = Record<string, number>;

export async function fetchCryptoPrices(
  currencyCodes: string[],
  vsCurrency: string,
): Promise<CryptoPriceMap> {
  const uniqueCodes = Array.from(new Set(currencyCodes));
  if (!vsCurrency || uniqueCodes.length === 0) return {};

  const ids = uniqueCodes
    .map((code) => CODE_TO_COINGECKO_ID[code])
    .filter(Boolean);
  if (ids.length === 0) return {};

  const vs = vsCurrency.toLowerCase();
  const apiKey = process.env.NEXT_PUBLIC_COINGECKO_API_KEY;
  const baseUrl =
    process.env.NEXT_PUBLIC_COINGECKO_BASE_URL ??
    "https://api.coingecko.com/api/v3";

  const url = new URL(`${baseUrl}/simple/price`);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", vs);
  if (apiKey) {
    url.searchParams.set("x_cg_demo_api_key", apiKey);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    return {};
  }

  const data = (await res.json()) as Record<
    string,
    Record<string, number | undefined>
  >;

  const result: CryptoPriceMap = {};
  for (const [code, id] of Object.entries(CODE_TO_COINGECKO_ID)) {
    if (!uniqueCodes.includes(code)) continue;
    const entry = data[id];
    const price = entry?.[vs];
    if (typeof price === "number") {
      result[code] = price;
    }
  }

  return result;
}

