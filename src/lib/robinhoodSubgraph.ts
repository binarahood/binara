/** Minimal read-only Robinhood Chain data source. */

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'.toLowerCase();

export interface RobinhoodSubgraphPool {
  id: string; tokenX?: string; tokenY?: string; binStep?: number; activeId?: number | null;
  reserveX?: string; reserveY?: string; totalValueLockedUSD?: string | null; volumeUSD?: string | null;
  feesUSD?: string | null; txCount?: number; createdAtBlockNumber?: number; createdAtTimestamp?: number; isAlive?: boolean;
}
interface GraphQLResponse<T> { data?: T; errors?: Array<{ message?: string }>; }

async function query<T>(body: string, variables: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(ROBINHOOD_SUBGRAPH_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: body, variables }), cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Subgraph HTTP ${response.status}`);
    const result = (await response.json()) as GraphQLResponse<T>;
    if (result.errors?.length) throw new Error(result.errors[0]?.message || 'Subgraph query failed');
    if (!result.data) throw new Error('Subgraph returned no data');
    return result.data;
  } finally { clearTimeout(timeout); }
}

export async function getPools(limit = 500): Promise<RobinhoodSubgraphPool[]> {
  const safeLimit = Math.min(500, Math.max(1, limit));
  const data = await query<{ DLMMPool?: RobinhoodSubgraphPool[] }>(`query GetPools($chainId: Int!, $limit: Int!) {
    DLMMPool(where: { chainId: { _eq: $chainId } } limit: $limit) { id tokenX tokenY binStep activeId }
  }`, { chainId: ROBINHOOD_CHAIN_ID, limit: safeLimit });
  return data.DLMMPool ?? [];
}
export async function checkSubgraph(): Promise<{ pools: number }> { return { pools: (await getPools(1)).length }; }
function shortAddress(address: string): string { const value = String(address || ''); return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value || 'UNKNOWN'; }

export function toLivePool(pool: RobinhoodSubgraphPool) {
  const tokenX = String(pool.tokenX || ''), tokenY = String(pool.tokenY || '');
  const tvl = pool.totalValueLockedUSD == null ? null : Number(pool.totalValueLockedUSD);
  return {
    id: pool.id, address: pool.id, pair: `${shortAddress(tokenX)}/${shortAddress(tokenY)}`,
    tokenA: shortAddress(tokenX), tokenB: shortAddress(tokenY), tokenAAddress: tokenX, tokenBAddress: tokenY,
    decimalsA: 18, decimalsB: 18, protocol: 'Robinhood DLMM', currentPrice: null, priceChange24h: null,
    binStep: Number(pool.binStep) || 0, activeBin: pool.activeId ?? null, fee: (Number(pool.binStep) || 0) * 0.01,
    tvl: Number.isFinite(tvl) && tvl >= 0 ? tvl : null, reserveX: pool.reserveX || '0', reserveY: pool.reserveY || '0',
    volume1h: null, volume6h: null, volume24h: null, volumeRaw24h: 0, volumeToTVL: 0, volatility: 0,
    analyticsScore: 35, riskLevel: 'MEDIUM' as const, estimatedAPR: null, timeInRange: null, swapCount24h: 0, swapCount1h: 0,
    status: pool.isAlive === false ? 'inactive' as const : 'active' as const, createdBlock: Number(pool.createdAtBlockNumber) || 0,
    createdAt: pool.createdAtTimestamp ? new Date(Number(pool.createdAtTimestamp) * 1000).toISOString() : null,
    updatedAt: new Date().toISOString(), stablePair: tokenX.toLowerCase() === USDG || tokenY.toLowerCase() === USDG,
    reserveXHuman: 0, reserveYHuman: 0,
  };
}
