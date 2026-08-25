'use client';

import { useState, useEffect, useCallback } from 'react';
import { LivePool } from '@/lib/liveTypes';

export type DataStatus = 'connecting' | 'live' | 'stale' | 'error';
export interface ChainStatus { status: DataStatus; blockNumber: number | null; chainId: number | null; lastUpdated: number | null; error: string | null; }
export interface DashboardMetrics {
  totalTVL: number | null;
  volume24h: number | null;
  highestVolTVL: number | null;
  highestVolTVLPair: string;
  lastSync: string;
}

function computeDashboardMetrics(pools: LivePool[]): DashboardMetrics {
  const totalTVLValues = pools.map((p) => p.tvl).filter((v): v is number => v !== null && Number.isFinite(v));
  const volumeValues = pools.map((p) => p.volume24h).filter((v): v is number => v !== null && Number.isFinite(v));
  const ratioPools = pools.filter((p) => p.volumeToTVL !== null && Number.isFinite(p.volumeToTVL));
  const highest = ratioPools.length ? ratioPools.reduce((best, p) => (p.volumeToTVL! > best.volumeToTVL! ? p : best)) : null;
  const now = new Date();
  return {
    totalTVL: totalTVLValues.length ? totalTVLValues.reduce((s, v) => s + v, 0) : null,
    volume24h: volumeValues.length ? volumeValues.reduce((s, v) => s + v, 0) : null,
    highestVolTVL: highest?.volumeToTVL ?? null,
    highestVolTVLPair: highest?.pair ?? 'N/A',
    lastSync: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
  };
}

const STALE_THRESHOLD_MS = 60_000;
const STATUS_INTERVAL_MS = 15_000;
const POOL_INTERVAL_MS = 30_000;

export function useChainStatus() {
  const [chainStatus, setChainStatus] = useState<ChainStatus>({ status: 'connecting', blockNumber: null, chainId: null, lastUpdated: null, error: null });
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chain/status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.status === 'error') setChainStatus((prev) => ({ ...prev, status: 'error', error: data.error || 'Unable to retrieve live Robinhood Chain data.', lastUpdated: Date.now() }));
      else setChainStatus({ status: 'live', blockNumber: data.blockNumber, chainId: data.chainId, lastUpdated: Date.now(), error: null });
    } catch { setChainStatus((prev) => ({ ...prev, status: 'error', error: 'Unable to retrieve live Robinhood Chain data.', lastUpdated: Date.now() })); }
  }, []);
  useEffect(() => { fetchStatus(); const id = setInterval(fetchStatus, STATUS_INTERVAL_MS); return () => clearInterval(id); }, [fetchStatus]);
  useEffect(() => { const id = setInterval(() => { setChainStatus((prev) => prev.status === 'live' && prev.lastUpdated && Date.now() - prev.lastUpdated > STALE_THRESHOLD_MS ? { ...prev, status: 'stale' } : prev); }, 5000); return () => clearInterval(id); }, []);
  return { chainStatus, refetch: fetchStatus };
}

export function usePoolsData(intervalMs = POOL_INTERVAL_MS) {
  const [pools, setPools] = useState<LivePool[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>(() => computeDashboardMetrics([]));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [indexerStatus, setIndexerStatus] = useState<string | null>(null);

  const fetchPools = useCallback(async () => {
    try {
      const res = await fetch('/api/chain/pools', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'Unable to retrieve live Robinhood Chain data.'); setIsLoading(false); return; }
      const livePools: LivePool[] = data.pools || [];
      setPools(livePools); setDashboardMetrics(computeDashboardMetrics(livePools)); setLastUpdated(Date.now()); setIndexerStatus(data.indexer?.status ?? null); setError(null);
    } catch { setError('Unable to retrieve live Robinhood Chain data.'); } finally { setIsLoading(false); }
  }, []);
  useEffect(() => { fetchPools(); const id = setInterval(fetchPools, intervalMs); return () => clearInterval(id); }, [fetchPools, intervalMs]);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => { const id = setInterval(() => { if (lastUpdated) setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000)); }, 1000); return () => clearInterval(id); }, [lastUpdated]);
  return { pools, dashboardMetrics, isLoading, error, lastUpdated, secondsAgo, indexerStatus, refetch: fetchPools };
}

export function useSinglePoolData(poolAddress?: string, intervalMs = 15_000) {
  const { pools, isLoading, error, secondsAgo, refetch } = usePoolsData(intervalMs);
  const pool = poolAddress ? pools.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase()) : pools[0];
  return { pool: pool ?? null, isLoading, error, secondsAgo, refetch };
}
