const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'robinhood';
const BATCH_SIZE = 20;
const TOKEN_PRICE_BATCH_SIZE = 30;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 800;

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
  source: 'geckoterminal';
}

export interface GeckoDiscoveredPool {
  id: string;
  address: string;
  name: string | null;
  baseTokenAddress: string | null;
  quoteTokenAddress: string | null;
  baseTokenSymbol: string | null;
  quoteTokenSymbol: string | null;
  baseTokenName: string | null;
  quoteTokenName: string | null;
  reserveUsd: number | null;
  volume24h: number | null;
  priceUsd: number | null;
  priceChange24h: number | null;
  source: 'geckoterminal-search';
}

interface GeckoPoolResponse {
  data?: Array<{
    id?: string;
    attributes?: {
      address?: string;
      name?: string;
      base_token_price_usd?: string | number | null;
      quote_token_price_usd?: string | number | null;
      base_token_price_quote_token?: string | number | null;
      reserve_in_usd?: string | number | null;
      volume_usd?: { h1?: string | number | null; h6?: string | number | null; h24?: string | number | null };
      price_change_percentage?: { h24?: string | number | null };
      transactions?: { h1?: { buys?: number | null; sells?: number | null }; h24?: { buys?: number | null; sells?: number | null } };
    };
    relationships?: {
      base_token?: { data?: { id?: string } };
      quote_token?: { data?: { id?: string } };
    };
  }>;
}

interface GeckoTokenPriceResponse { data?: Record<string, string | number | null>; }

function toFiniteNumber(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
function sumTx(value: { buys?: number | null; sells?: number | null } | undefined): number | null { if (!value) return null; const buys = toFiniteNumber(value.buys); const sells = toFiniteNumber(value.sells); return buys === null || sells === null ? null : buys + sells; }
function isComplete(item: GeckoPoolMarketData | undefined): boolean { return Boolean(item && item.baseTokenPriceUsd !== null && item.reserveUsd !== null && item.volume24h !== null); }

async function fetchBatch(addresses: string[], retry = 0): Promise<GeckoPoolMarketData[]> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const encoded = addresses.map((address) => encodeURIComponent(address)).join(',');
    const response = await fetch(`${BASE_URL}/networks/${NETWORK}/pools/multi/${encoded}`, { headers: { accept: 'application/json;version=20230203' }, next: { revalidate: 60 }, signal: controller.signal });
    if (!response.ok) { if ((response.status === 429 || response.status >= 500) && retry < MAX_RETRIES) { await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)); return fetchBatch(addresses, retry + 1); } throw new Error(`GeckoTerminal HTTP ${response.status}`); }
    const body = await response.json() as GeckoPoolResponse;
    return (body.data || []).flatMap((item) => { const a = item.attributes; if (!a?.address) return []; return [{ address: a.address.toLowerCase(), baseTokenPriceUsd: toFiniteNumber(a.base_token_price_usd), quoteTokenPriceUsd: toFiniteNumber(a.quote_token_price_usd), baseTokenPriceQuoteToken: toFiniteNumber(a.base_token_price_quote_token), priceChange24h: toFiniteNumber(a.price_change_percentage?.h24), volume1h: toFiniteNumber(a.volume_usd?.h1), volume6h: toFiniteNumber(a.volume_usd?.h6), volume24h: toFiniteNumber(a.volume_usd?.h24), swapCount1h: sumTx(a.transactions?.h1), swapCount24h: sumTx(a.transactions?.h24), reserveUsd: toFiniteNumber(a.reserve_in_usd), source: 'geckoterminal' as const }]; });
  } finally { clearTimeout(timer); }
}

async function fetchTokenPriceBatch(addresses: string[], retry = 0): Promise<Map<string, number>> {
  const result = new Map<string, number>(); if (!addresses.length) return result;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const encoded = addresses.map((address) => encodeURIComponent(address)).join(',');
    const response = await fetch(`${BASE_URL}/simple/networks/${NETWORK}/token_price/${encoded}`, { headers: { accept: 'application/json;version=20230203' }, next: { revalidate: 30 }, signal: controller.signal });
    if (!response.ok) { if ((response.status === 429 || response.status >= 500) && retry < MAX_RETRIES) { await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)); return fetchTokenPriceBatch(addresses, retry + 1); } return result; }
    const body = await response.json() as GeckoTokenPriceResponse;
    for (const [address, value] of Object.entries(body.data || {})) { const price = toFiniteNumber(value); if (price !== null && price > 0) result.set(address.toLowerCase(), price); }
    return result;
  } catch { return result; } finally { clearTimeout(timer); }
}

export async function fetchGeckoTokenPrices(addresses: string[]): Promise<{ byToken: Map<string, number>; batchesSucceeded: number; batchesAttempted: number }> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean))); if (!unique.length) return { byToken: new Map(), batchesSucceeded: 0, batchesAttempted: 0 };
  const batches: string[][] = []; for (let i = 0; i < unique.length; i += TOKEN_PRICE_BATCH_SIZE) batches.push(unique.slice(i, i + TOKEN_PRICE_BATCH_SIZE));
  const results = await Promise.all(batches.map(fetchTokenPriceBatch)); const byToken = new Map<string, number>(); let batchesSucceeded = 0;
  for (const result of results) { if (result.size > 0) batchesSucceeded += 1; for (const [address, price] of result) byToken.set(address, price); }
  return { byToken, batchesSucceeded, batchesAttempted: batches.length };
}

/**
 * On-demand search. CoinGecko's documented search endpoint is a Pro Onchain
 * endpoint. We only call it when a CoinGecko API key is configured. Without a
 * key we intentionally fall back to the already indexed Robinhood pool set at
 * the route layer rather than guessing at an undocumented public endpoint.
 */
export async function searchGeckoPools(query: string): Promise<GeckoDiscoveredPool[]> {
  const apiKey = process.env.COINGECKO_API_KEY || process.env.GECKO_API_KEY;
  if (!apiKey || query.trim().length < 2) return [];
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ query: query.trim(), network: NETWORK, include: 'base_token,quote_token' });
    const response = await fetch(`https://pro-api.coingecko.com/api/v3/onchain/search/pools?${params.toString()}`, { headers: { accept: 'application/json', 'x-cg-pro-api-key': apiKey }, next: { revalidate: 60 }, signal: controller.signal });
    if (!response.ok) return [];
    const body = await response.json() as GeckoPoolResponse;
    const included = Array.isArray((body as unknown as { included?: unknown }).included) ? (body as unknown as { included: Array<{ id?: string; type?: string; attributes?: { address?: string; symbol?: string; name?: string } }> }).included : [];
    const tokenMap = new Map(included.filter((item) => item.type === 'token' && item.id).map((item) => [item.id as string, item.attributes || {}]));
    return (body.data || []).map((item) => {
      const a = item.attributes || {};
      const baseId = item.relationships?.base_token?.data?.id;
      const quoteId = item.relationships?.quote_token?.data?.id;
      const base = baseId ? tokenMap.get(baseId) : undefined;
      const quote = quoteId ? tokenMap.get(quoteId) : undefined;
      return { id: item.id || `${NETWORK}_${String(a.address || '').toLowerCase()}`, address: String(a.address || '').toLowerCase(), name: a.name || null, baseTokenAddress: base?.address?.toLowerCase() || null, quoteTokenAddress: quote?.address?.toLowerCase() || null, baseTokenSymbol: base?.symbol || null, quoteTokenSymbol: quote?.symbol || null, baseTokenName: base?.name || null, quoteTokenName: quote?.name || null, reserveUsd: toFiniteNumber(a.reserve_in_usd), volume24h: toFiniteNumber(a.volume_usd?.h24), priceUsd: toFiniteNumber(a.base_token_price_usd), priceChange24h: toFiniteNumber(a.price_change_percentage?.h24), source: 'geckoterminal-search' as const };
    }).filter((pool) => pool.address);
  } catch { return []; } finally { clearTimeout(timer); }
}

export async function fetchGeckoPoolMarketData(addresses: string[]): Promise<{ byPool: Map<string, GeckoPoolMarketData>; complete: boolean; poolsReturned: number; batchesSucceeded: number; batchesAttempted: number }> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean))); if (!unique.length) return { byPool: new Map(), complete: true, poolsReturned: 0, batchesSucceeded: 0, batchesAttempted: 0 };
  const batches: string[][] = []; for (let i = 0; i < unique.length; i += BATCH_SIZE) batches.push(unique.slice(i, i + BATCH_SIZE));
  const results = await Promise.allSettled(batches.map(fetchBatch)); const byPool = new Map<string, GeckoPoolMarketData>(); let batchesSucceeded = 0;
  for (const result of results) { if (result.status !== 'fulfilled') continue; batchesSucceeded += 1; for (const item of result.value) byPool.set(item.address, item); }
  return { byPool, complete: unique.every((address) => isComplete(byPool.get(address))), poolsReturned: byPool.size, batchesSucceeded, batchesAttempted: batches.length };
}
