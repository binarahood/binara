const BASE_URL = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'robinhood';
const BATCH_SIZE = 30;
const REQUEST_TIMEOUT_MS = 8_000;

export interface GeckoPoolMarketData {
  address: string;
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  swapCount1h: number | null;
  swapCount24h: number | null;
  reserveUsd: number | null;
  source: 'geckoterminal';
}

interface GeckoPoolResponse {
  data?: Array<{
    attributes?: {
      address?: string;
      reserve_in_usd?: string | number | null;
      volume_usd?: {
        h1?: string | number | null;
        h6?: string | number | null;
        h24?: string | number | null;
      };
      transactions?: {
        h1?: { buys?: number | null; sells?: number | null };
        h24?: { buys?: number | null; sells?: number | null };
      };
    };
  }>;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumTx(value: { buys?: number | null; sells?: number | null } | undefined): number | null {
  if (!value) return null;
  const buys = toFiniteNumber(value.buys);
  const sells = toFiniteNumber(value.sells);
  if (buys === null || sells === null) return null;
  return buys + sells;
}

async function fetchBatch(addresses: string[]): Promise<GeckoPoolMarketData[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const encoded = addresses.map((address) => encodeURIComponent(address)).join(',');
    const response = await fetch(
      `${BASE_URL}/networks/${NETWORK}/pools/multi/${encoded}`,
      {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    if (!response.ok) throw new Error(`GeckoTerminal HTTP ${response.status}`);

    const body = await response.json() as GeckoPoolResponse;
    return (body.data || []).flatMap((item) => {
      const attributes = item.attributes;
      if (!attributes?.address) return [];

      return [{
        address: attributes.address.toLowerCase(),
        volume1h: toFiniteNumber(attributes.volume_usd?.h1),
        volume6h: toFiniteNumber(attributes.volume_usd?.h6),
        volume24h: toFiniteNumber(attributes.volume_usd?.h24),
        swapCount1h: sumTx(attributes.transactions?.h1),
        swapCount24h: sumTx(attributes.transactions?.h24),
        reserveUsd: toFiniteNumber(attributes.reserve_in_usd),
        source: 'geckoterminal' as const,
      }];
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches verified market metrics for EVM pool addresses in batches.
 * GeckoTerminal's pool endpoint exposes h1/h6/h24 volume and transaction counts.
 * Missing pools remain missing; this function never invents or estimates values.
 */
export async function fetchGeckoPoolMarketData(addresses: string[]): Promise<{
  byPool: Map<string, GeckoPoolMarketData>;
  complete: boolean;
  poolsReturned: number;
}> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase())));
  if (!unique.length) return { byPool: new Map(), complete: true, poolsReturned: 0 };

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) batches.push(unique.slice(i, i + BATCH_SIZE));

  const results = await Promise.allSettled(batches.map(fetchBatch));
  const byPool = new Map<string, GeckoPoolMarketData>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) byPool.set(item.address, item);
  }

  const complete = unique.every((address) => {
    const item = byPool.get(address);
    return item?.volume24h !== null && item?.volume24h !== undefined;
  });

  return { byPool, complete, poolsReturned: byPool.size };
}
