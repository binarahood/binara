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

export function getOpportunityScoreBreakdown(pool: Pick<LivePool, 'tvl' | 'volume24h' | 'volumeToTVL' | 'swapCount24h'>): OpportunityScoreBreakdown | null {
  const values = [pool.tvl, pool.volume24h, pool.volumeToTVL, pool.swapCount24h];
  if (values.some((v) => v === null || !Number.isFinite(v))) return null;
  if ((pool.tvl ?? 0) <= 0 || (pool.volume24h ?? 0) < 0 || (pool.volumeToTVL ?? 0) < 0 || (pool.swapCount24h ?? 0) < 0) return null;

  const efficiency = Math.min(OPPORTUNITY_WEIGHTS.efficiency, (pool.volumeToTVL! / 10) * OPPORTUNITY_WEIGHTS.efficiency);
  const volume = Math.min(OPPORTUNITY_WEIGHTS.volume, Math.log10(pool.volume24h! + 1) * 4.5);
  const liquidity = Math.min(OPPORTUNITY_WEIGHTS.liquidity, (Math.log10(pool.tvl! + 1) / Math.log10(100_000 + 1)) * OPPORTUNITY_WEIGHTS.liquidity);
  const activity = Math.min(OPPORTUNITY_WEIGHTS.activity, pool.swapCount24h! / 100);
  const total = Math.min(100, Math.round(efficiency + volume + liquidity + activity));

  return {
    efficiency: Number(efficiency.toFixed(2)),
    volume: Number(volume.toFixed(2)),
    liquidity: Number(liquidity.toFixed(2)),
    activity: Number(activity.toFixed(2)),
    total,
  };
}

export function getOpportunityScore(pool: Pick<LivePool, 'tvl' | 'volume24h' | 'volumeToTVL' | 'swapCount24h'>): number | null {
  return getOpportunityScoreBreakdown(pool)?.total ?? null;
}
