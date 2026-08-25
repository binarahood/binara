/**
 * Shared Pool type for the live API response.
 * Live/derived metrics are nullable when the verified source does not provide them.
 */
export interface LivePool {
  id: string;
  address: string;
  pair: string;
  tokenA: string;
  tokenB: string;
  tokenAAddress: string;
  tokenBAddress: string;
  decimalsA: number;
  decimalsB: number;
  protocol: string;

  // Price
  currentPrice: number | null;
  priceChange24h: number | null;

  // DLMM specifics
  binStep: number;
  activeBin: number | null;
  fee: number;

  // Liquidity
  tvl: number | null;
  reserveX: string;
  reserveY: string;

  // Volume (USD when available)
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  volumeRaw24h: number;

  // Derived metrics — null means the verified inputs are unavailable.
  volumeToTVL: number | null;
  volatility: number | null;
  analyticsScore: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
  estimatedAPR: number | null;
  timeInRange: number | null;

  // GMGN token intelligence (optional; requires GMGN_API_KEY)
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

  // Activity
  swapCount24h: number | null;
  swapCount1h: number | null;
  status: 'active' | 'inactive';

  // Timestamps
  createdBlock: number;
  createdAt: string | null;
  updatedAt: string;
}

/** Helpers for display */
export function fmtUSD(n: number | null | undefined, fallback = 'N/A'): string {
  if (n === null || n === undefined) return fallback;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function fmtPrice(n: number | null | undefined, fallback = 'N/A'): string {
  if (n === null || n === undefined) return fallback;
  if (n >= 1000) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

export function fmtPct(n: number | null | undefined, fallback = 'N/A'): string {
  if (n === null || n === undefined) return fallback;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}
