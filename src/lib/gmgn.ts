const GMGN_HOST = 'https://openapi.gmgn.ai';
const GMGN_TIMEOUT_MS = 6_000;
const GMGN_CHAIN = 'robinhood';
const GMGN_CONCURRENCY = 6;
const GMGN_BATCH_DELAY_MS = 550;
const GMGN_RETRY_DELAY_MS = 900;

export interface GmgnTokenData {
  address: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  holderCount: number | null;
  volume24h: number | null;
  swaps24h: number | null;
  smartWallets: number | null;
  renownedWallets: number | null;
  rugRatio: number | null;
  washTrading: boolean | null;
  biggestPoolAddress: string | null;
  exchange: string | null;
  source: 'gmgn';
}

interface GmgnEnvelope {
  code?: number | string;
  data?: unknown;
  message?: string;
  error?: string;
  reset_at?: number | string;
}

function finite(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const n = finite(value);
    if (n !== null) return n;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function extractData(envelope: GmgnEnvelope): Record<string, unknown> | null {
  const data = asRecord(envelope.data);
  if (!data) return null;
  return asRecord(data.data) ?? data;
}

function isRateLimited(response: Response, envelope: GmgnEnvelope | null): boolean {
  if (response.status === 429) return true;
  const error = String(envelope?.error || envelope?.message || '').toUpperCase();
  return error.includes('RATE_LIMIT') || error.includes('TOO MANY REQUEST');
}

export function isGmgnConfigured(): boolean {
  return Boolean(process.env.GMGN_API_KEY);
}

async function requestToken(address: string, retry = false): Promise<GmgnTokenData | null> {
  const apiKey = process.env.GMGN_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GMGN_TIMEOUT_MS);
  try {
    const query = new URLSearchParams({
      chain: GMGN_CHAIN,
      address,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      client_id: crypto.randomUUID(),
    });
    const response = await fetch(`${GMGN_HOST}/v1/token/info?${query.toString()}`, {
      headers: { accept: 'application/json', 'X-APIKEY': apiKey },
      cache: 'no-store',
      signal: controller.signal,
    });

    let envelope: GmgnEnvelope | null = null;
    try { envelope = await response.json() as GmgnEnvelope; } catch { return null; }

    if (isRateLimited(response, envelope) && !retry) {
      await new Promise((resolve) => setTimeout(resolve, GMGN_RETRY_DELAY_MS));
      return requestToken(address, true);
    }
    if (!response.ok) return null;

    const data = extractData(envelope);
    if (!data) return null;

    const price = firstRecord(data.price, data.market, data.market_data);
    const pool = firstRecord(data.pool, data.liquidity_pool, data.pool_info);
    const walletTags = firstRecord(data.wallet_tags_stat, data.wallet_tags, data.smart_money);

    const biggestPool = typeof data.biggest_pool_address === 'string'
      ? data.biggest_pool_address
      : typeof pool?.address === 'string' ? pool.address : null;

    return {
      address: String(data.address || address).toLowerCase(),
      symbol: typeof data.symbol === 'string' ? data.symbol : null,
      name: typeof data.name === 'string' ? data.name : null,
      priceUsd: firstFinite(price?.price, data.price_usd, data.price),
      liquidityUsd: firstFinite(data.liquidity, pool?.liquidity, pool?.liquidity_usd, data.liquidity_usd),
      holderCount: firstFinite(data.holder_count, data.holders),
      volume24h: firstFinite(price?.volume_24h, data.volume_24h),
      swaps24h: firstFinite(price?.swaps_24h, data.swaps_24h),
      smartWallets: firstFinite(walletTags?.smart_wallets, data.smart_wallets),
      renownedWallets: firstFinite(walletTags?.renowned_wallets, data.renowned_wallets),
      rugRatio: firstFinite(data.rug_ratio, data.rug_ratio_pct),
      washTrading: typeof data.is_wash_trading === 'boolean' ? data.is_wash_trading : null,
      biggestPoolAddress: biggestPool ? biggestPool.toLowerCase() : null,
      exchange: typeof pool?.exchange === 'string' ? pool.exchange : typeof data.exchange === 'string' ? data.exchange : null,
      source: 'gmgn',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGmgnTokenData(addresses: string[]): Promise<{
  byToken: Map<string, GmgnTokenData>;
  configured: boolean;
  tokensReturned: number;
  tokensAttempted: number;
}> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean)));
  const configured = isGmgnConfigured();
  if (!unique.length || !configured) return { byToken: new Map(), configured, tokensReturned: 0, tokensAttempted: 0 };

  const byToken = new Map<string, GmgnTokenData>();
  for (let offset = 0; offset < unique.length; offset += GMGN_CONCURRENCY) {
    const batch = unique.slice(offset, offset + GMGN_CONCURRENCY);
    const results = await Promise.all(batch.map((address) => requestToken(address)));
    for (const item of results) if (item) byToken.set(item.address, item);
    if (offset + GMGN_CONCURRENCY < unique.length) await new Promise((resolve) => setTimeout(resolve, GMGN_BATCH_DELAY_MS));
  }

  return { byToken, configured: true, tokensReturned: byToken.size, tokensAttempted: unique.length };
}
