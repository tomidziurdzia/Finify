const CODE_TO_COINGECKO_ID: Record<string, string> = {
  AAVE: "aave",
  ADA: "cardano",
  ARB: "arbitrum",
  ATOM: "cosmos",
  APT: "aptos",
  AVAX: "avalanche-2",
  BCH: "bitcoin-cash",
  BNB: "binancecoin",
  BTC: "bitcoin",
  DOGE: "dogecoin",
  DOT: "polkadot",
  ETC: "ethereum-classic",
  ETH: "ethereum",
  FIL: "filecoin",
  FTM: "fantom",
  INJ: "injective-protocol",
  LDO: "lido-dao",
  LINK: "chainlink",
  LTC: "litecoin",
  MATIC: "matic-network",
  MKR: "maker",
  NEXO: "nexo",
  NEAR: "near",
  OP: "optimism",
  PEPE: "pepe",
  POL: "polygon-ecosystem-token",
  RENDER: "render-token",
  SHIB: "shiba-inu",
  SOL: "solana",
  SUI: "sui",
  TON: "the-open-network",
  TRX: "tron",
  UNI: "uniswap",
  USDC: "usd-coin",
  USDT: "tether",
  WBTC: "wrapped-bitcoin",
  XLM: "stellar",
  XRP: "ripple",
};

const resolvedTickerCache = new Map<string, string | null>();

export type CryptoPriceMap = Record<string, number>;

function getCoinGeckoBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_COINGECKO_BASE_URL ??
    "https://api.coingecko.com/api/v3"
  );
}

function getCoinGeckoHeaders() {
  const apiKey = process.env.NEXT_PUBLIC_COINGECKO_API_KEY;
  return apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: getCoinGeckoHeaders(),
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveCoinGeckoId(code: string): Promise<string | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return null;

  const staticMatch = CODE_TO_COINGECKO_ID[normalizedCode];
  if (staticMatch) return staticMatch;

  if (resolvedTickerCache.has(normalizedCode)) {
    return resolvedTickerCache.get(normalizedCode) ?? null;
  }

  const searchUrl = new URL(`${getCoinGeckoBaseUrl()}/search`);
  searchUrl.searchParams.set("query", normalizedCode);

  const data = await fetchJson<{
    coins?: Array<{ id: string; symbol: string; market_cap_rank?: number | null }>;
  }>(searchUrl.toString());

  const match =
    data?.coins
      ?.filter((coin) => coin.symbol.toUpperCase() === normalizedCode)
      .sort(
        (a, b) =>
          (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER),
      )[0]?.id ?? null;

  resolvedTickerCache.set(normalizedCode, match);
  return match;
}

export async function fetchCryptoPrices(
  currencyCodes: string[],
  vsCurrency: string,
): Promise<CryptoPriceMap> {
  const uniqueCodes = Array.from(
    new Set(currencyCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
  );

  if (!vsCurrency || uniqueCodes.length === 0) return {};

  const vs = vsCurrency.trim().toLowerCase();

  const resolvedEntries = await Promise.all(
    uniqueCodes.map(async (code) => ({
      code,
      id: await resolveCoinGeckoId(code),
    })),
  );

  const ids = Array.from(
    new Set(resolvedEntries.map((entry) => entry.id).filter(Boolean) as string[]),
  );

  if (ids.length === 0) return {};

  const url = new URL(`${getCoinGeckoBaseUrl()}/simple/price`);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", vs);

  const data = await fetchJson<Record<string, Record<string, number | undefined>>>(
    url.toString(),
  );

  if (!data) return {};

  const result: CryptoPriceMap = {};
  for (const entry of resolvedEntries) {
    if (!entry.id) continue;
    const price = data[entry.id]?.[vs];
    if (typeof price === "number") {
      result[entry.code] = price;
    }
  }

  if (vs === "usd") {
    if (result.USDT == null && uniqueCodes.includes("USDT")) result.USDT = 1;
    if (result.USDC == null && uniqueCodes.includes("USDC")) result.USDC = 1;
  }

  return result;
}
