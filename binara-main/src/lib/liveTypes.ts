/** Shared types for strictly live Robinhood Chain data. */
export interface LivePool {
  id: string;
  address: string;
  pair: string;
  tokenA: string | null;
  tokenB: string | null;
  tokenAAddress: string;
  tokenBAddress: string;
  decimalsA: number | null;
  decimalsB: number | null;
  protocol: string;

  currentPrice: number | null;
  priceChange24h: number | null;

  binStep: number | null;
  activeBin: number | null;
  fee: number | null;

  tvl: number | null;
  reserveX: string | null;
  reserveY: string | null;

  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  volumeRaw24h: number | null;

  volumeToTVL: number | null;
  volatility: number | null;
  analyticsScore: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
  estimatedAPR: number | null;
  timeInRange: number | null;

  swapCount24h: number | null;
  swapCount1h: number | null;
  status: 'active' | 'inactive';

  createdBlock: number | null;
  createdAt: string | null;
  updatedAt: string;
}

export function fmtUSD(n: number | null | undefined, fallback = 'N/A'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return fallback;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function fmtPrice(n: number | null | undefined, fallback = 'N/A'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return fallback;
  if (n >= 1000) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

export function fmtPct(n: number | null | undefined, fallback = 'N/A'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return fallback;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}
