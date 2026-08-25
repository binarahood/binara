'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LivePool } from '@/lib/liveTypes';
import { DataStatus, DashboardMetrics } from './useChainData';

export interface StreamStatus {
  status: DataStatus;
  blockNumber: number | null;
  chainId: number | null;
  wsConnected: boolean;
  lastUpdated: number | null;
  error: string | null;
  indexerStatus: string | null;
  poolsDiscovered: number;
  swapsIndexed: number;
  poolDataStatus: 'unknown' | 'indexing' | 'live' | 'error';
  lastPoolDataUpdate: number | null;
  hasRealPoolData: boolean;
}

export interface PoolStreamUpdate {
  blockNumber: number | null;
  price: number | null;
  volume1h: number | null;
  volume24h: number | null;
  activeBin: number | null;
  swapCount: number | null;
  timestamp: number;
}

function computeDashboardMetrics(pools: LivePool[]): DashboardMetrics {
  if (pools.length === 0) {
    return { totalTVL: 0, volume24h: 0, avgFeeTier: 0, highestVolTVL: 0, highestVolTVLPair: 'N/A', bestFeePool: 'N/A', bestFeeAPR: 0, bestFeeScore: 0, mostVolatilePair: 'N/A', mostVolatileChange: 0, lastSync: '' };
  }
  const totalTVL = pools.reduce((s, p) => s + (p.tvl ?? 0), 0);
  const volume24h = pools.reduce((s, p) => s + (p.volume24h ?? 0), 0);
  const weightedFee = pools.reduce((s, p) => s + p.fee * (p.tvl ?? 0), 0);
  const avgFeeTier = totalTVL > 0 ? weightedFee / totalTVL : 0;
  const highestVolTVLPool = pools.reduce((best, p) => p.volumeToTVL > best.volumeToTVL ? p : best, pools[0]);
  const bestFeePool = pools.reduce((best, p) => (p.estimatedAPR ?? 0) > (best.estimatedAPR ?? 0) ? p : best, pools[0]);
  const mostVolatile = pools.reduce((best, p) => Math.abs(p.priceChange24h ?? 0) > Math.abs(best.priceChange24h ?? 0) ? p : best, pools[0]);
  const now = new Date();
  const lastSync = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return { totalTVL, volume24h, avgFeeTier, highestVolTVL: highestVolTVLPool.volumeToTVL, highestVolTVLPair: highestVolTVLPool.pair, bestFeePool: bestFeePool.pair, bestFeeAPR: bestFeePool.estimatedAPR ?? 0, bestFeeScore: bestFeePool.analyticsScore, mostVolatilePair: mostVolatile.pair, mostVolatileChange: mostVolatile.priceChange24h ?? 0, lastSync };
}

const STALE_THRESHOLD_MS = 60_000;

export function usePoolStream() {
  const [pools, setPools] = useState<LivePool[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>(() => computeDashboardMetrics([]));
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ status: 'connecting', blockNumber: null, chainId: null, wsConnected: false, lastUpdated: null, error: null, indexerStatus: null, poolsDiscovered: 0, swapsIndexed: 0, poolDataStatus: 'unknown', lastPoolDataUpdate: null, hasRealPoolData: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const lastFetchRef = useRef<number>(0);
  const fetchInFlightRef = useRef(false);

  const fetchPools = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 10_000) return;
    lastFetchRef.current = now;
    fetchInFlightRef.current = true;
    try {
      const res = await fetch('/api/chain/pools', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Unable to retrieve live Robinhood Chain data.');
        setIsLoading(false);
        return;
      }
      const livePools: LivePool[] = data.pools || [];
      const hasRealPools = livePools.length > 0;
      const apiIndexerStatus: string = data.indexer?.status ?? data.status ?? 'unknown';
      let poolDataStatus: StreamStatus['poolDataStatus'] = 'unknown';
      if (data.error) poolDataStatus = 'error';
      else if (hasRealPools) poolDataStatus = 'live';
      else if (apiIndexerStatus === 'indexing' || apiIndexerStatus === 'connecting') poolDataStatus = 'indexing';
      else if (apiIndexerStatus === 'error') poolDataStatus = 'error';
      else poolDataStatus = 'indexing';
      setPools(livePools);
      setDashboardMetrics(computeDashboardMetrics(livePools));
      setStreamStatus((prev) => ({ ...prev, status: 'live', lastUpdated: Date.now(), error: null, indexerStatus: apiIndexerStatus, poolsDiscovered: data.indexer?.poolsDiscovered ?? 0, swapsIndexed: data.indexer?.swapsIndexed ?? 0, poolDataStatus, lastPoolDataUpdate: hasRealPools ? Date.now() : prev.lastPoolDataUpdate, hasRealPoolData: hasRealPools }));
      setError(null);
    } catch {
      setError('Unable to retrieve live Robinhood Chain data.');
      setStreamStatus((prev) => ({ ...prev, status: 'error', error: 'Unable to retrieve live Robinhood Chain data.' }));
    } finally {
      setIsLoading(false);
      fetchInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPools();
    const es = new EventSource('/api/chain/stream');
    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStreamStatus((prev) => ({ ...prev, status: 'live', blockNumber: data.blockNumber ?? prev.blockNumber, chainId: data.chainId ?? prev.chainId, lastUpdated: data.timestamp ?? Date.now(), error: null, indexerStatus: data.indexerStatus ?? prev.indexerStatus, poolsDiscovered: data.poolsDiscovered ?? prev.poolsDiscovered, swapsIndexed: data.swapsIndexed ?? prev.swapsIndexed }));
      } catch { /* ignore */ }
    });
    es.addEventListener('block', (e: MessageEvent) => {
      try { const data = JSON.parse(e.data); setStreamStatus((prev) => ({ ...prev, blockNumber: data.blockNumber ?? prev.blockNumber, lastUpdated: data.timestamp ?? Date.now(), status: 'live' })); } catch { /* ignore */ }
    });
    es.addEventListener('pool_update', (e: MessageEvent) => {
      try { const data = JSON.parse(e.data); setStreamStatus((prev) => ({ ...prev, indexerStatus: data.indexerStatus ?? prev.indexerStatus, poolsDiscovered: data.poolsDiscovered ?? prev.poolsDiscovered, swapsIndexed: data.swapsIndexed ?? prev.swapsIndexed })); } catch { /* ignore */ }
      fetchPools();
    });
    es.addEventListener('ws_status', (e: MessageEvent) => {
      try { const data = JSON.parse(e.data); setStreamStatus((prev) => ({ ...prev, wsConnected: data.connected ?? false, error: data.error ?? prev.error })); } catch { /* ignore */ }
    });
    es.addEventListener('error', (e: MessageEvent) => {
      try { const data = JSON.parse(e.data); setStreamStatus((prev) => ({ ...prev, status: 'error', error: data.error ?? 'Unable to retrieve live Robinhood Chain data.', lastUpdated: Date.now() })); setError(data.error ?? 'Unable to retrieve live Robinhood Chain data.'); } catch { /* ignore */ }
    });
    es.onerror = () => { setStreamStatus((prev) => ({ ...prev, status: prev.lastUpdated ? 'stale' : 'error', wsConnected: false })); };
    return () => { es.close(); };
  }, [fetchPools]);

  useEffect(() => {
    const id = setInterval(() => {
      setStreamStatus((prev) => { if (prev.status === 'live' && prev.lastUpdated && Date.now() - prev.lastUpdated > STALE_THRESHOLD_MS) return { ...prev, status: 'stale' }; return prev; });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setStreamStatus((prev) => { if (prev.lastUpdated) setSecondsAgo(Math.floor((Date.now() - prev.lastUpdated) / 1000)); return prev; });
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  return { pools, dashboardMetrics, streamStatus, isLoading, error, secondsAgo, refetch: fetchPools };
}

export function useSinglePoolStream(poolAddress?: string) {
  const { pools, streamStatus, isLoading, error, secondsAgo, refetch } = usePoolStream();
  const normalizedAddress = poolAddress?.trim().toLowerCase();
  const pool = normalizedAddress ? pools.find((p) => p.address?.trim().toLowerCase() === normalizedAddress) : undefined;
  return { pool: pool ?? null, streamStatus, isLoading, error, secondsAgo, refetch };
}
