const GMGN_HOST = 'https://openapi.gmgn.ai';
const GMGN_CHAIN = 'robinhood';
const MAX_CONCURRENCY = 4;
const REQUEST_GAP_MS = 80;

export interface GMGNTokenInfo {
  address: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  holderCount: number | null;
  mainPool: string | null;
  creationTimestamp: number | null;
  walletTags: Record<string, number> | null;
}

function authQuery(params: Record<string, string>): string {
  const query = new URLSearchParams({
    ...params,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    client_id: crypto.randomUUID(),
  });
  return query.toString();
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function unwrapData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  if (root.data && typeof root.data === 'object') return root.data as Record<string, unknown>;
  return root;
}

function normalizeInfo(address: string, raw: unknown): GMGNTokenInfo | null {
  const data = unwrapData(raw);
  if (!data) return null;
  const price = data.price && typeof data.price === 'object' ? data.price as Record<string, unknown> : null;
  const tags = data.wallet_tags_stat && typeof data.wallet_tags_stat === 'object'
    ? data.wallet_tags_stat as Record<string, unknown>
    : null;
  const walletTags = tags
    ? Object.fromEntries(Object.entries(tags).map(([key, value]) => [key, numberOrNull(value) ?? 0]))
    : null;

  return {
    address,
    symbol: stringOrNull(data.symbol),
    name: stringOrNull(data.name),
    priceUsd: numberOrNull(price?.price ?? data.price_usd ?? data.price),
    liquidityUsd: numberOrNull(data.liquidity),
    holderCount: numberOrNull(data.holder_count),
    mainPool: stringOrNull(data.biggest_pool_address),
    creationTimestamp: numberOrNull(data.creation_timestamp),
    walletTags,
  };
}

async function fetchOne(apiKey: string, address: string): Promise<GMGNTokenInfo | null> {
  const url = `${GMGN_HOST}/v1/token/info?${authQuery({ chain: GMGN_CHAIN, address })}`;
  const response = await fetch(url, {
    headers: { 'X-APIKEY': apiKey, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return normalizeInfo(address, body);
}

export async function fetchGMGNTokenInfo(addresses: string[]): Promise<Map<string, GMGNTokenInfo>> {
  const apiKey = process.env.GMGN_API_KEY;
  const result = new Map<string, GMGNTokenInfo>();
  if (!apiKey) return result;

  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a))));
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const address = unique[index];
      try {
        const info = await fetchOne(apiKey, address);
        if (info) result.set(address, info);
      } catch {
        // GMGN is enrichment only; a failed lookup must never break pool discovery.
      }
      if (cursor < unique.length) await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
    }
  };

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, unique.length) }, () => worker()));
  return result;
}
