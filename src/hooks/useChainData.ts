'use client';

import { useState, useEffect, useCallback } from 'react';
import { LivePool } from '@/lib/liveTypes';

export type DataStatus = 'connecting' | 'live' | 'stale' | 'error';

export interface ChainStatus {
  status: DataStatus;
  blockNumber: number | null;
  chainId: number | null;
  lastUpdated: number | null;
  error: string | null;
}

export interface DashboardMetrics {
  totalTVL: number;
  volume24h: number;
  avgFeeTier: number;
  highestVolTVL: number;
  highestVolTVLPair: string;
  bestFeePool: string;
  bestFeeAPR: number;
  bestFeeScore: number;
  mostVolatilePair: string;
  mostVolatileChange: number;
  lastSync: string;
}

function computeDashboardMetrics(pools: LivePool[]): DashboardMetrics {
  if (pools.length === 0) {
    return {
      totalTVL: 0,
      volume24h: 0,
      avgFeeTier: 0,
      highestVolTVL: 0,
      highestVolTVLPair: 'N/A',
      bestFeePool: 'N/A',
      bestFeeAPR: 0,
      bestFeeScore: 0,
      mostVolatilePair: 'N/A',
      mostVolatileChange: 0,
      lastSync: '',
    };
  }

  const totalTVL = pools.reduce((s, p) => s + (p.tvl ?? 0), 0);
  const volume24h = pools.reduce((s, p) => s + (p.volume24h ?? 0), 0);
  const weightedFee = pools.reduce((s, p) => s + p.fee * (p.tvl ?? 0), 0);
  const avgFeeTier = totalTVL > 0 ? weightedFee / totalTVL : 0;

  const highestVolTVLPool = pools.reduce((best, p) =>
    p.volumeToTVL > best.volumeToTVL ? p : best, pools[0]);
  const bestFeePool = pools.reduce((best, p) =>
    (p.estimatedAPR ?? 0) > (best.estimatedAPR ?? 0) ? p : best, pools[0]);
  const mostVolatile = pools.reduce((best, p) =>
    Math.abs(p.priceChange24h ?? 0) > Math.abs(best.priceChange24h ?? 0) ? p : best, pools[0]);

  const now = new Date();
  const lastSync = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  return {
    totalTVL,
    volume24h,
    avgFeeTier,
    highestVolTVL: highestVolTVLPool.volumeToTVL,
    highestVolTVLPair: highestVolTVLPool.pair,
    bestFeePool: bestFeePool.pair,
    bestFeeAPR: bestFeePool.estimatedAPR ?? 0,
    bestFeeScore: bestFeePool.analyticsScore,
    mostVolatilePair: mostVolatile.pair,
    mostVolatileChange: mostVolatile.priceChange24h ?? 0,
    lastSync,
  };
}

// How many seconds before data is considered stale
const STALE_THRESHOLD_MS = 60_000;
// Status poll interval
const STATUS_INTERVAL_MS = 15_000;
// Pool data refresh interval
const POOL_INTERVAL_MS = 30_000;

export function useChainStatus() {
  const [chainStatus, setChainStatus] = useState<ChainStatus>({
    status: 'connecting',
    blockNumber: null,
    chainId: null,
    lastUpdated: null,
    error: null,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chain/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        setChainStatus((prev) => ({
          ...prev,
          status: 'error',
          error: data.error || 'Unable to retrieve live Robinhood Chain data.',
          lastUpdated: Date.now(),
        }));
      } else {
        setChainStatus({
          status: 'live',
          blockNumber: data.blockNumber,
          chainId: data.chainId,
          lastUpdated: Date.now(),
          error: null,
        });
      }
    } catch {
      setChainStatus((prev) => ({
        ...prev,
        status: 'error',
        error: 'Unable to retrieve live Robinhood Chain data.',
        lastUpdated: Date.now(),
      }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Check staleness
  useEffect(() => {
    const id = setInterval(() => {
      setChainStatus((prev) => {
        if (prev.status === 'live' && prev.lastUpdated) {
          const age = Date.now() - prev.lastUpdated;
          if (age > STALE_THRESHOLD_MS) {
            return { ...prev, status: 'stale' };
          }
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return { chainStatus, refetch: fetchStatus };
}

export function usePoolsData(intervalMs = POOL_INTERVAL_MS) {
  const [pools, setPools] = useState<LivePool[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>(
    () => computeDashboardMetrics([])
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [indexerStatus, setIndexerStatus] = useState<string | null>(null);

  const fetchPools = useCallback(async () => {
    try {
      const res = await fetch('/api/chain/pools', { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Unable to retrieve live Robinhood Chain data.');
        setIsLoading(false);
        return;
      }

      const livePools: LivePool[] = data.pools || [];
      setPools(livePools);
      setDashboardMetrics(computeDashboardMetrics(livePools));
      setLastUpdated(Date.now());
      setIndexerStatus(data.indexer?.status ?? null);
      setError(null);
    } catch {
      setError('Unable to retrieve live Robinhood Chain data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
    const id = setInterval(fetchPools, intervalMs);
    return () => clearInterval(id);
  }, [fetchPools, intervalMs]);

  // Seconds since last update
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return { pools, dashboardMetrics, isLoading, error, lastUpdated, secondsAgo, indexerStatus, refetch: fetchPools };
}

// Single pool hook — fetches from pool list by address
export function useSinglePoolData(poolAddress?: string, intervalMs = 15_000) {
  const { pools, isLoading, error, secondsAgo, refetch } = usePoolsData(intervalMs);
  const pool = poolAddress
    ? pools.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase())
    : pools[0];

  return { pool: pool ?? null, isLoading, error, secondsAgo, refetch };
}
