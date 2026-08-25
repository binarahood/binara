/** Minimal read-only Robinhood Chain data source.
 *
 * Phase 1 intentionally uses only the Kingdom GraphQL subgraph. No RPC,
 * factory scanning, websocket stream, or in-memory indexer is required to
 * discover pools.
 */

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_SUBGRAPH_URL =
  'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';

const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'.toLowerCase();

export interface RobinhoodSubgraphPool {
  id: string;
  tokenX: { id: string; symbol: string; decimals: number };
  tokenY: { id: string; symbol: string; decimals: number };
  binStep: number;
  activeId: number | null;
  reserveX: string;
  reserveY: string;
  totalValueLockedUSD: string | null;
  volumeUSD: string | null;
  feesUSD: string | null;
  txCount: number;
  createdAtBlockNumber: number;
  createdAtTimestamp: number;
  isAlive: boolean;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

async function query<T>(body: string, variables: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(ROBINHOOD_SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: body, variables }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Subgraph HTTP ${response.status}`);
    const result = (await response.json()) as GraphQLResponse<T>;
    if (result.errors?.length) {
      throw new Error(result.errors[0]?.message || 'Subgraph query failed');
    }
    if (!result.data) throw new Error('Subgraph returned no data');
    return result.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPools(limit = 500): Promise<RobinhoodSubgraphPool[]> {
  const safeLimit = Math.min(500, Math.max(1, limit));
  const data = await query<{ DLMMPool?: RobinhoodSubgraphPool[] }>(
    `query GetPools($chainId: Int!, $limit: Int!) {
      DLMMPool(
        where: { chainId: { _eq: $chainId } }
        limit: $limit
        order_by: { createdAtTimestamp: desc }
      ) {
        id
        tokenX { id symbol decimals }
        tokenY { id symbol decimals }
        binStep
        activeId
        reserveX
        reserveY
        totalValueLockedUSD
        volumeUSD
        feesUSD
        txCount
        createdAtBlockNumber
        createdAtTimestamp
        isAlive
      }
    }`,
    { chainId: ROBINHOOD_CHAIN_ID, limit: safeLimit },
  );

  return data.DLMMPool ?? [];
}

export async function checkSubgraph(): Promise<{ pools: number }> {
  const pools = await getPools(1);
  return { pools: pools.length };
}

function rawAmount(value: string | null | undefined, decimals: number): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  try {
    const result = Number(BigInt(value)) / 10 ** decimals;
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function priceFromBin(activeId: number | null, binStep: number, dx: number, dy: number): number | null {
  if (activeId == null || !Number.isFinite(activeId) || !Number.isFinite(binStep)) return null;
  const base = 1 + binStep / 10_000;
  const raw = Math.pow(base, activeId - 8_388_608);
  const price = raw * 10 ** (dx - dy);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function stable(address: string): boolean {
  return address.toLowerCase() === USDG;
}

export function toLivePool(pool: RobinhoodSubgraphPool) {
  const dx = Number(pool.tokenX.decimals) || 18;
  const dy = Number(pool.tokenY.decimals) || 18;
  const price = priceFromBin(pool.activeId, Number(pool.binStep), dx, dy);
  const subgraphTvl = pool.totalValueLockedUSD == null ? null : Number(pool.totalValueLockedUSD);
  const tvl = Number.isFinite(subgraphTvl) && subgraphTvl >= 0 ? subgraphTvl : null;
  const reserveX = rawAmount(pool.reserveX, dx);
  const reserveY = rawAmount(pool.reserveY, dy);

  // volumeUSD is cumulative in the pool entity, so it is deliberately NOT
  // presented as a fake 24h volume. Phase 2 can add a real Swap query.
  const volume24h = null;
  const volumeToTVL = tvl && tvl > 0 ? 0 : 0;
  const score = tvl != null ? Math.min(100, Math.round(40 + Math.log10(Math.max(1, tvl)) * 5)) : 35;

  return {
    id: pool.id,
    address: pool.id,
    pair: `${pool.tokenX.symbol || pool.tokenX.id.slice(0, 6)}/${pool.tokenY.symbol || pool.tokenY.id.slice(0, 6)}`,
    tokenA: pool.tokenX.symbol || 'UNKNOWN',
    tokenB: pool.tokenY.symbol || 'UNKNOWN',
    tokenAAddress: pool.tokenX.id,
    tokenBAddress: pool.tokenY.id,
    decimalsA: dx,
    decimalsB: dy,
    protocol: 'Robinhood DLMM',
    currentPrice: price,
    priceChange24h: null,
    binStep: Number(pool.binStep) || 0,
    activeBin: pool.activeId,
    fee: (Number(pool.binStep) || 0) * 0.01,
    tvl,
    reserveX: pool.reserveX || '0',
    reserveY: pool.reserveY || '0',
    volume1h: null,
    volume6h: null,
    volume24h,
    volumeRaw24h: 0,
    volumeToTVL,
    volatility: 0,
    analyticsScore: score,
    riskLevel: 'MEDIUM' as const,
    estimatedAPR: null,
    timeInRange: null,
    swapCount24h: 0,
    swapCount1h: 0,
    status: pool.isAlive ? 'active' as const : 'inactive' as const,
    createdBlock: Number(pool.createdAtBlockNumber) || 0,
    createdAt: pool.createdAtTimestamp ? new Date(Number(pool.createdAtTimestamp) * 1000).toISOString() : null,
    updatedAt: new Date().toISOString(),
    stablePair: stable(pool.tokenX.id) || stable(pool.tokenY.id),
    reserveXHuman: reserveX,
    reserveYHuman: reserveY,
  };
}
