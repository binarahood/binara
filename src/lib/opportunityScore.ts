import { LivePool } from './liveTypes';

export const OPPORTUNITY_WEIGHTS = {
  efficiency: 35,
  volume: 25,
  liquidity: 25,
  activity: 15,
} as const;

// A pool below this verified TVL is not considered a rankable opportunity.
// This is deliberately conservative: the scanner may still display the pool,
// but it must not outrank pools with meaningful liquidity.
export const MIN_RANKABLE_TVL_USD = 1_000;

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

  const tvl = pool.tvl ?? 0;
  const volume24h = pool.volume24h ?? 0;
  const volumeToTVL = pool.volumeToTVL ?? 0;
  const swapCount24h = pool.swapCount24h ?? 0;

  if (tvl < MIN_RANKABLE_TVL_USD || volume24h < 0 || volumeToTVL < 0 || swapCount24h < 0) return null;

  const efficiency = Math.min(OPPORTUNITY_WEIGHTS.efficiency, (volumeToTVL / 10) * OPPORTUNITY_WEIGHTS.efficiency);
  const volume = Math.min(OPPORTUNITY_WEIGHTS.volume, Math.log10(volume24h + 1) * 4.5);
  const liquidity = Math.min(OPPORTUNITY_WEIGHTS.liquidity, (Math.log10(tvl + 1) / Math.log10(100_000 + 1)) * OPPORTUNITY_WEIGHTS.liquidity);
  const activity = Math.min(OPPORTUNITY_WEIGHTS.activity, swapCount24h / 100);
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
