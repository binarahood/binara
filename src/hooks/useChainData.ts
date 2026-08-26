'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPoolVisibility, LivePool, PoolVisibility } from '@/lib/liveTypes';

export type DataStatus = 'connecting' | 'live' | 'stale' | 'error';
export interface ChainStatus { status: DataStatus; blockNumber: number | null; chainId: number | null; lastUpdated: number | null; error: string | null; }
export interface DashboardMetrics { totalTVL: number; volume24h: number; avgFeeTier: number; highestVolTVL: number | null; highestVolTVLPair: string; bestFeePool: string; bestFeeAPR: number | null; bestFeeScore: number | null; mostVolatilePair: string; mostVolatileChange: number | null; lastSync: string; }

function computeDashboardMetrics(pools: LivePool[]): DashboardMetrics {
  if (pools.length === 0) return { totalTVL: 0, volume24h: 0, avgFeeTier: 0, highestVolTVL: null, highestVolTVLPair: 'N/A', bestFeePool: 'N/A', bestFeeAPR: null, bestFeeScore: null, mostVolatilePair: 'N/A', mostVolatileChange: null, lastSync: '' };
  const totalTVL = pools.reduce((s, p) => s + (p.tvl ?? 0), 0);
  const volume24h = pools.reduce((s, p) => s + (p.volume24h ?? 0), 0);
  const weightedFee = pools.reduce((s, p) => s + p.fee * (p.tvl ?? 0), 0);
  const avgFeeTier = totalTVL > 0 ? weightedFee / totalTVL : 0;
  const poolsWithVolTVL = pools.filter((p) => p.volumeToTVL !== null);
  const highestVolTVLPool = poolsWithVolTVL.length ? poolsWithVolTVL.reduce((best, p) => p.volumeToTVL! > best.volumeToTVL! ? p : best, poolsWithVolTVL[0]) : null;
  const poolsWithAPR = pools.filter((p) => p.estimatedAPR !== null);
  const bestFeePool = poolsWithAPR.length ? poolsWithAPR.reduce((best, p) => p.estimatedAPR! > best.estimatedAPR! ? p : best, poolsWithAPR[0]) : null;
  const poolsWithPriceChange = pools.filter((p) => p.priceChange24h !== null);
  const mostVolatile = poolsWithPriceChange.length ? poolsWithPriceChange.reduce((best, p) => Math.abs(p.priceChange24h!) > Math.abs(best.priceChange24h!) ? p : best, poolsWithPriceChange[0]) : null;
  const now = new Date(); const lastSync = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return { totalTVL, volume24h, avgFeeTier, highestVolTVL: highestVolTVLPool?.volumeToTVL ?? null, highestVolTVLPair: highestVolTVLPool?.pair ?? 'N/A', bestFeePool: bestFeePool?.pair ?? 'N/A', bestFeeAPR: bestFeePool?.estimatedAPR ?? null, bestFeeScore: bestFeePool?.analyticsScore ?? null, mostVolatilePair: mostVolatile?.pair ?? 'N/A', mostVolatileChange: mostVolatile?.priceChange24h ?? null, lastSync };
}

const STALE_THRESHOLD_MS = 60_000;
const STATUS_INTERVAL_MS = 15_000;
const POOL_INTERVAL_MS = 30_000;

export function useChainStatus() {
  const [chainStatus, setChainStatus] = useState<ChainStatus>({ status: 'connecting', blockNumber: null, chainId: null, lastUpdated: null, error: null });
  const fetchStatus = useCallback(async () => {
    try { const res = await fetch('/api/chain/status', { cache: 'no-store' }); const data = await res.json(); if (!res.ok || data.status === 'error') setChainStatus((prev) => ({ ...prev, status: 'error', error: data.error || 'Unable to retrieve live Robinhood Chain data.', lastUpdated: Date.now() })); else setChainStatus({ status: 'live', blockNumber: data.blockNumber, chainId: data.chainId, lastUpdated: Date.now(), error: null }); }
    catch { setChainStatus((prev) => ({ ...prev, status: 'error', error: 'Unable to retrieve live Robinhood Chain data.', lastUpdated: Date.now() })); }
  }, []);
  useEffect(() => { fetchStatus(); const id = setInterval(fetchStatus, STATUS_INTERVAL_MS); return () => clearInterval(id); }, [fetchStatus]);
  useEffect(() => { const id = setInterval(() => { setChainStatus((prev) => prev.status === 'live' && prev.lastUpdated && Date.now() - prev.lastUpdated > STALE_THRESHOLD_MS ? { ...prev, status: 'stale' } : prev); }, 5000); return () => clearInterval(id); }, []);
  return { chainStatus, refetch: fetchStatus };
}

function mergePools(basePools: LivePool[], enrichedPools: LivePool[]): LivePool[] {
  const enrichedByAddress = new Map<string, LivePool>();
  for (const pool of enrichedPools) {
    for (const key of [pool.address, pool.id].filter(Boolean).map((value) => value.toLowerCase())) enrichedByAddress.set(key, pool);
  }
  return basePools.map((base) => {
    const enriched = enrichedByAddress.get(base.address.toLowerCase()) ?? enrichedByAddress.get(base.id.toLowerCase());
    return enriched ? { ...base, ...enriched, id: base.id, address: base.address } : base;
  });
}

export function usePoolsData(intervalMs = POOL_INTERVAL_MS, visibilityMode: PoolVisibility | 'all' = 'active') {
  const [pools, setPools] = useState<LivePool[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>(() => computeDashboardMetrics([]));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [indexerStatus, setIndexerStatus] = useState<string | null>(null);
  const basePoolsRef = useRef<LivePool[]>([]);
  const enrichmentInFlight = useRef(false);

  const publishPools = useCallback((allPools: LivePool[]) => {
    const classified = allPools.map((pool) => ({ ...pool, visibility: getPoolVisibility(pool) }));
    const visible = classified.filter((pool) => visibilityMode === 'all' || pool.visibility === visibilityMode);
    setPools(visible);
    setDashboardMetrics(computeDashboardMetrics(classified.filter((p) => p.visibility === 'active')));
  }, [visibilityMode]);

  const fetchEnrichment = useCallback(async () => {
    if (enrichmentInFlight.current) return;
    enrichmentInFlight.current = true;
    try {
      const res = await fetch('/api/chain/pools/enrich', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) return;
      const enriched = (data.pools || []) as LivePool[];
      const merged = mergePools(basePoolsRef.current, enriched);
      if (merged.length > 0) { basePoolsRef.current = merged; publishPools(merged); setLastUpdated(Date.now()); }
    } catch {
      // Enrichment is supplementary; base pool discovery remains healthy when an upstream provider is slow or unavailable.
    } finally {
      enrichmentInFlight.current = false;
    }
  }, [publishPools]);

  const fetchPools = useCallback(async () => {
    try {
      const res = await fetch('/api/chain/pools', { cache: 'no-store' }); const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'Unable to retrieve live Robinhood Chain data.'); setIsLoading(false); return; }
      const rawPools: LivePool[] = data.pools || [];
      basePoolsRef.current = rawPools;
      publishPools(rawPools);
      setLastUpdated(Date.now()); setIndexerStatus(data.indexer?.status ?? null); setError(null); setIsLoading(false);
      void fetchEnrichment();
    } catch { setError('Unable to retrieve live Robinhood Chain data.'); setIsLoading(false); }
  }, [fetchEnrichment, publishPools]);

  useEffect(() => { fetchPools(); const id = setInterval(fetchPools, intervalMs); return () => clearInterval(id); }, [fetchPools, intervalMs]);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => { const id = setInterval(() => { if (lastUpdated) setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000)); }, 1000); return () => clearInterval(id); }, [lastUpdated]);
  return { pools, dashboardMetrics, isLoading, error, lastUpdated, secondsAgo, indexerStatus, refetch: fetchPools };
}

export function useSinglePoolData(poolAddress?: string, intervalMs = 15_000) {
  const { pools, isLoading, error, secondsAgo, refetch } = usePoolsData(intervalMs, 'all');
  const pool = poolAddress ? pools.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase()) : pools.find((p) => p.visibility === 'active') ?? null;
  return { pool: pool ?? null, isLoading, error, secondsAgo, refetch };
}
