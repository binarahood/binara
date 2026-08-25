const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'robinhood';
const BATCH_SIZE = 30;
const REQUEST_TIMEOUT_MS = 8_000;

export interface GeckoPoolMarketData {
  address: string;
  baseTokenPriceUsd: number | null;
  quoteTokenPriceUsd: number | null;
  baseTokenPriceQuoteToken: number | null;
  priceChange24h: number | null;
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  swapCount1h: number | null;
  swapCount24h: number | null;
  reserveUsd: number | null;
  volatility24h: number | null;
  priceBand5Pct24h: number | null;
  source: 'geckoterminal';
}

interface GeckoPoolResponse {
  data?: Array<{ attributes?: {
    address?: string;
    base_token_price_usd?: string | number | null;
    quote_token_price_usd?: string | number | null;
    base_token_price_quote_token?: string | number | null;
    reserve_in_usd?: string | number | null;
    volume_usd?: { h1?: string | number | null; h6?: string | number | null; h24?: string | number | null };
    price_change_percentage?: { h24?: string | number | null };
    transactions?: { h1?: { buys?: number | null; sells?: number | null }; h24?: { buys?: number | null; sells?: number | null } };
  }> }>;
}

interface GeckoOhlcvResponse { data?: { attributes?: { ohlcv_list?: Array<Array<number | string>> } } }

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumTx(value: { buys?: number | null; sells?: number | null } | undefined): number | null {
  if (!value) return null;
  const buys = toFiniteNumber(value.buys);
  const sells = toFiniteNumber(value.sells);
  return buys === null || sells === null ? null : buys + sells;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json;version=20230203' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`GeckoTerminal HTTP ${response.status}`);
    return response.json();
  } finally { clearTimeout(timer); }
}

function realizedVolatility(closes: number[]): number | null {
  if (closes.length < 3) return null;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const r = Math.log(closes[i] / closes[i - 1]);
    if (Number.isFinite(r)) returns.push(r);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Number.isFinite(variance) ? Math.sqrt(variance) * Math.sqrt(24) * 100 : null;
}

async function fetch24hAnalytics(address: string, currentPrice: number | null) {
  try {
    const body = await fetchJson(`${BASE_URL}/networks/${NETWORK}/pools/${encodeURIComponent(address)}/ohlcv/hour?limit=25`) as GeckoOhlcvResponse;
    const rows = body.data?.attributes?.ohlcv_list ?? [];
    const closes = rows.map((row) => toFiniteNumber(row[4])).filter((value): value is number => value !== null && value > 0).reverse();
    const volatility24h = realizedVolatility(closes);
    if (currentPrice === null || closes.length === 0) return { volatility24h, priceBand5Pct24h: null as number | null };
    const lower = currentPrice * 0.95;
    const upper = currentPrice * 1.05;
    const inBand = closes.filter((price) => price >= lower && price <= upper).length;
    return { volatility24h, priceBand5Pct24h: Number(((inBand / closes.length) * 100).toFixed(1)) };
  } catch {
    return { volatility24h: null, priceBand5Pct24h: null };
  }
}

async function fetchBatch(addresses: string[]): Promise<GeckoPoolMarketData[]> {
  const encoded = addresses.map((address) => encodeURIComponent(address)).join(',');
  const body = await fetchJson(`${BASE_URL}/networks/${NETWORK}/pools/multi/${encoded}`) as GeckoPoolResponse;
  const basic = (body.data || []).flatMap((item) => {
    const a = item.attributes;
    if (!a?.address) return [];
    return [{
      address: a.address.toLowerCase(),
      baseTokenPriceUsd: toFiniteNumber(a.base_token_price_usd),
      quoteTokenPriceUsd: toFiniteNumber(a.quote_token_price_usd),
      baseTokenPriceQuoteToken: toFiniteNumber(a.base_token_price_quote_token),
      priceChange24h: toFiniteNumber(a.price_change_percentage?.h24),
      volume1h: toFiniteNumber(a.volume_usd?.h1),
      volume6h: toFiniteNumber(a.volume_usd?.h6),
      volume24h: toFiniteNumber(a.volume_usd?.h24),
      swapCount1h: sumTx(a.transactions?.h1),
      swapCount24h: sumTx(a.transactions?.h24),
      reserveUsd: toFiniteNumber(a.reserve_in_usd),
      source: 'geckoterminal' as const,
    }];
  });
  return Promise.all(basic.map(async (item) => ({ ...item, ...(await fetch24hAnalytics(item.address, item.baseTokenPriceUsd)) })));
}

export async function fetchGeckoPoolMarketData(addresses: string[]): Promise<{ byPool: Map<string, GeckoPoolMarketData>; complete: boolean; poolsReturned: number }> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean)));
  if (!unique.length) return { byPool: new Map(), complete: true, poolsReturned: 0 };
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) batches.push(unique.slice(i, i + BATCH_SIZE));
  const results = await Promise.allSettled(batches.map(fetchBatch));
  const byPool = new Map<string, GeckoPoolMarketData>();
  for (const result of results) if (result.status === 'fulfilled') for (const item of result.value) byPool.set(item.address, item);
  const complete = unique.every((address) => {
    const item = byPool.get(address);
    return item?.volume24h !== null && item?.volume24h !== undefined && item?.baseTokenPriceUsd !== null;
  });
  return { byPool, complete, poolsReturned: byPool.size };
}
