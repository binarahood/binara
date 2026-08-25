/**
 * Shared Pool type for the live API response.
 * Live/derived metrics are nullable when the verified source does not provide them.
 */
export type PoolVisibility = 'active' | 'unresolved' | 'inactive';

export interface LivePool {
  id: string;
  address: string;
  pair: string;
  tokenA: string;
  tokenB: string;
  tokenAName?: string | null;
  tokenBName?: string | null;
  tokenAAddress: string;
  tokenBAddress: string;
  decimalsA: number;
  decimalsB: number;
  protocol: string;
  currentPrice: number | null;
  priceChange24h: number | null;
  binStep: number;
  activeBin: number | null;
  fee: number;
  tvl: number | null;
  reserveX: string;
  reserveY: string;
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  volumeRaw24h: number;
  volumeToTVL: number | null;
  volatility: number | null;
  analyticsScore: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
  estimatedAPR: number | null;
  timeInRange: number | null;
  gmgn: {
    source: 'gmgn';
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
  } | null;
  swapCount24h: number | null;
  swapCount1h: number | null;
  status: 'active' | 'inactive';
  /** UI/data-contract classification. Derived from verified pool status + TVL availability. */
  visibility?: PoolVisibility;
  createdBlock: number;
  createdAt: string | null;
  updatedAt: string;
}

export function getPoolVisibility(pool: Pick<LivePool, 'status' | 'tvl'>): PoolVisibility {
  if (pool.status === 'inactive') return 'inactive';
  return pool.tvl !== null && pool.tvl > 0 ? 'active' : 'unresolved';
}

/** Display helpers. Missing verified data is rendered as an em dash rather than a misleading zero. */
export function fmtUSD(n: number | null | undefined, fallback = '—'): string {
  if (n === null || n === undefined) return fallback;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function fmtPrice(n: number | null | undefined, fallback = '—'): string {
  if (n === null || n === undefined) return fallback;
  if (n >= 1000) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

export function fmtPct(n: number | null | undefined, fallback = '—'): string {
  if (n === null || n === undefined) return fallback;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}
