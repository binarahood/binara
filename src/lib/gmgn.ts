const GMGN_HOST = 'https://openapi.gmgn.ai';
const GMGN_TIMEOUT_MS = 6_000;
const GMGN_CHAIN = 'robinhood';

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
}

function finite(value: unknown): number | null {
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

function extractData(envelope: GmgnEnvelope): Record<string, unknown> | null {
  const data = asRecord(envelope.data);
  if (data) return data;
  return null;
}

export function isGmgnConfigured(): boolean {
  return Boolean(process.env.GMGN_API_KEY);
}

async function fetchToken(address: string): Promise<GmgnTokenData | null> {
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
      headers: {
        accept: 'application/json',
        'X-APIKEY': apiKey,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const envelope = await response.json() as GmgnEnvelope;
    const data = extractData(envelope);
    if (!data) return null;

    const price = asRecord(data.price);
    const pool = asRecord(data.pool);
    const walletTags = asRecord(data.wallet_tags_stat);

    return {
      address: String(data.address || address).toLowerCase(),
      symbol: typeof data.symbol === 'string' ? data.symbol : null,
      name: typeof data.name === 'string' ? data.name : null,
      priceUsd: firstFinite(price?.price),
      liquidityUsd: firstFinite(data.liquidity, pool?.liquidity),
      holderCount: firstFinite(data.holder_count),
      volume24h: firstFinite(price?.volume_24h),
      swaps24h: firstFinite(price?.swaps_24h),
      smartWallets: firstFinite(walletTags?.smart_wallets),
      renownedWallets: firstFinite(walletTags?.renowned_wallets),
      rugRatio: firstFinite(data.rug_ratio),
      washTrading: typeof data.is_wash_trading === 'boolean' ? data.is_wash_trading : null,
      biggestPoolAddress: typeof data.biggest_pool_address === 'string' ? data.biggest_pool_address.toLowerCase() : null,
      exchange: typeof pool?.exchange === 'string' ? pool.exchange : null,
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
}> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase())));
  if (!unique.length || !isGmgnConfigured()) return { byToken: new Map(), configured: isGmgnConfigured(), tokensReturned: 0 };

  // GMGN's documented token-info route is low weight, but keep concurrency
  // conservative because a pool list contains repeated token addresses.
  const results = await Promise.all(unique.map(fetchToken));
  const byToken = new Map<string, GmgnTokenData>();
  for (const item of results) if (item) byToken.set(item.address, item);
  return { byToken, configured: true, tokensReturned: byToken.size };
}
