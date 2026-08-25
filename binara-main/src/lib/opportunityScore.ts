import { LivePool } from './liveTypes';

export const OPPORTUNITY_WEIGHTS = {
  efficiency: 35,
  volume: 25,
  liquidity: 25,
  activity: 15,
} as const;

export interface OpportunityScoreBreakdown {
  efficiency: number;
  volume: number;
  liquidity: number;
  activity: number;
  total: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Verified-data opportunity score.
 * Missing inputs produce N/A rather than an invented score.
 * Log scaling prevents a single extreme metric from dominating the result.
 */
export function getOpportunityScoreBreakdown(
  pool: Pick<LivePool, 'tvl' | 'volume24h' | 'volumeToTVL' | 'swapCount24h'>,
): OpportunityScoreBreakdown | null {
  const values = [pool.tvl, pool.volume24h, pool.volumeToTVL, pool.swapCount24h];
  if (values.some((v) => v === null || !Number.isFinite(v))) return null;
  if ((pool.tvl ?? 0) <= 0 || (pool.volume24h ?? 0) < 0 || (pool.volumeToTVL ?? 0) < 0 || (pool.swapCount24h ?? 0) < 0) return null;

  const efficiency = clamp01(Math.log1p(pool.volumeToTVL!) / Math.log1p(10)) * OPPORTUNITY_WEIGHTS.efficiency;
  const volume = clamp01(Math.log1p(pool.volume24h!) / Math.log1p(1_000_000)) * OPPORTUNITY_WEIGHTS.volume;
  const liquidity = clamp01(Math.log1p(pool.tvl!) / Math.log1p(1_000_000)) * OPPORTUNITY_WEIGHTS.liquidity;
  const activity = clamp01(Math.log1p(pool.swapCount24h!) / Math.log1p(10_000)) * OPPORTUNITY_WEIGHTS.activity;
  const total = Math.round(efficiency + volume + liquidity + activity);

  return {
    efficiency: Number(efficiency.toFixed(2)),
    volume: Number(volume.toFixed(2)),
    liquidity: Number(liquidity.toFixed(2)),
    activity: Number(activity.toFixed(2)),
    total: Math.min(100, Math.max(0, total)),
  };
}

export function getOpportunityScore(
  pool: Pick<LivePool, 'tvl' | 'volume24h' | 'volumeToTVL' | 'swapCount24h'>,
): number | null {
  return getOpportunityScoreBreakdown(pool)?.total ?? null;
}
