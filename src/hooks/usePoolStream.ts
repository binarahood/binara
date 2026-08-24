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
  /** Granular pool data status independent of chain/WS connection */
  poolDataStatus: 'unknown' | 'indexing' | 'live' | 'error';
  /** Timestamp of the last successful pool data fetch that returned real pools */
  lastPoolDataUpdate: number | null;
  /** True only when /api/chain/pools returned at least one real pool */
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

const STALE_THRESHOLD_MS = 60_000;

/**
 * usePoolStream — replaces setInterval polling with a server-sent events stream
 * backed by a server-side WebSocket connection to Robinhood Chain.
 *
 * On each new block the server emits a `pool_update` event. The hook also
 * performs an initial REST fetch of pool data and re-fetches whenever a
 * `pool_update` event arrives (rate-limited to at most once per 10 s).
 */
export function usePoolStream() {
  const [pools, setPools] = useState<LivePool[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>(
    () => computeDashboardMetrics([])
  );
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({
    status: 'connecting',
    blockNumber: null,
    chainId: null,
    wsConnected: false,
    lastUpdated: null,
    error: null,
    indexerStatus: null,
    poolsDiscovered: 0,
    swapsIndexed: 0,
    poolDataStatus: 'unknown',
    lastPoolDataUpdate: null,
    hasRealPoolData: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  const lastFetchRef = useRef<number>(0);
  const fetchInFlightRef = useRef(false);

  // Fetch pool data from REST endpoint (same as before)
  const fetchPools = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    const now = Date.now();
    // Rate-limit: don't re-fetch more than once per 10 s
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

      // Determine granular pool data status
      let poolDataStatus: StreamStatus['poolDataStatus'] = 'unknown';
      if (data.error) {
        poolDataStatus = 'error';
      } else if (hasRealPools) {
        poolDataStatus = 'live';
      } else if (apiIndexerStatus === 'indexing' || apiIndexerStatus === 'connecting') {
        poolDataStatus = 'indexing';
      } else if (apiIndexerStatus === 'error') {
        poolDataStatus = 'error';
      } else {
        // No pools returned but no explicit indexing/error status — treat as indexing
        poolDataStatus = 'indexing';
      }

      setPools(livePools);
      setDashboardMetrics(computeDashboardMetrics(livePools));
      setStreamStatus((prev) => ({
        ...prev,
        // Chain/WS status stays 'live' if we got a valid response (chain is reachable)
        // but we do NOT conflate this with pool data being live
        status: 'live',
        lastUpdated: Date.now(),
        error: null,
        indexerStatus: apiIndexerStatus,
        poolsDiscovered: data.indexer?.poolsDiscovered ?? 0,
        swapsIndexed: data.indexer?.swapsIndexed ?? 0,
        poolDataStatus,
        lastPoolDataUpdate: hasRealPools ? Date.now() : prev.lastPoolDataUpdate,
        hasRealPoolData: hasRealPools,
      }));
      setError(null);
    } catch {
      setError('Unable to retrieve live Robinhood Chain data.');
      setStreamStatus((prev) => ({ ...prev, status: 'error', error: 'Unable to retrieve live Robinhood Chain data.' }));
    } finally {
      setIsLoading(false);
      fetchInFlightRef.current = false;
    }
  }, []);

  // Open SSE stream to /api/chain/stream
  useEffect(() => {
    // Initial pool fetch
    fetchPools();

    const es = new EventSource('/api/chain/stream');

    // SSE is the primary realtime path, but keep a low-frequency REST fallback
    // so a newly started serverless instance can populate pools even when the
    // websocket/subscription is temporarily unavailable.
    const fallbackRefresh = window.setInterval(() => {
      fetchPools();
    }, 30_000);

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStreamStatus((prev) => ({
          ...prev,
          status: 'live',
          blockNumber: data.blockNumber ?? prev.blockNumber,
          chainId: data.chainId ?? prev.chainId,
          lastUpdated: data.timestamp ?? Date.now(),
          error: null,
          indexerStatus: data.indexerStatus ?? prev.indexerStatus,
          poolsDiscovered: data.poolsDiscovered ?? prev.poolsDiscovered,
          swapsIndexed: data.swapsIndexed ?? prev.swapsIndexed,
        }));
      } catch { /* ignore */ }
    });

    es.addEventListener('block', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStreamStatus((prev) => ({
          ...prev,
          blockNumber: data.blockNumber ?? prev.blockNumber,
          lastUpdated: data.timestamp ?? Date.now(),
          status: 'live',
        }));
      } catch { /* ignore */ }
    });

    es.addEventListener('pool_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStreamStatus((prev) => ({
          ...prev,
          indexerStatus: data.indexerStatus ?? prev.indexerStatus,
          poolsDiscovered: data.poolsDiscovered ?? prev.poolsDiscovered,
          swapsIndexed: data.swapsIndexed ?? prev.swapsIndexed,
        }));
      } catch { /* ignore */ }
      // New block arrived — refresh pool data (rate-limited)
      fetchPools();
    });

    es.addEventListener('ws_status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStreamStatus((prev) => ({
          ...prev,
          wsConnected: data.connected ?? false,
          error: data.error ?? prev.error,
        }));
      } catch { /* ignore */ }
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStreamStatus((prev) => ({
          ...prev,
          status: 'error',
          error: data.error ?? 'Unable to retrieve live Robinhood Chain data.',
          lastUpdated: Date.now(),
        }));
        setError(data.error ?? 'Unable to retrieve live Robinhood Chain data.');
      } catch { /* ignore */ }
    });

    // Native EventSource error (connection dropped)
    es.onerror = () => {
      setStreamStatus((prev) => ({
        ...prev,
        status: prev.lastUpdated ? 'stale' : 'error',
        wsConnected: false,
      }));
    };

    return () => {
      window.clearInterval(fallbackRefresh);
      es.close();
    };
  }, [fetchPools]);

  // Staleness detector
  useEffect(() => {
    const id = setInterval(() => {
      setStreamStatus((prev) => {
        if (prev.status === 'live' && prev.lastUpdated) {
          const age = Date.now() - prev.lastUpdated;
          if (age > STALE_THRESHOLD_MS) {
            return { ...prev, status: 'stale' };
          }
        }
        return prev;
      });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  // Seconds-ago counter
  useEffect(() => {
    const id = setInterval(() => {
      setStreamStatus((prev) => {
        if (prev.lastUpdated) {
          setSecondsAgo(Math.floor((Date.now() - prev.lastUpdated) / 1000));
        }
        return prev;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  return {
    pools,
    dashboardMetrics,
    streamStatus,
    isLoading,
    error,
    secondsAgo,
    refetch: fetchPools,
  };
}

/**
 * useSinglePoolStream — like useSinglePoolData but driven by the SSE stream
 * instead of a polling interval.
 */
export function useSinglePoolStream(poolAddress?: string) {
  const { pools, streamStatus, isLoading, error, secondsAgo, refetch } = usePoolStream();
  const pool = poolAddress ? pools.find((p) => p.address === poolAddress) : pools[0];
  return {
    pool: pool ?? null,
    streamStatus,
    isLoading,
    error,
    secondsAgo,
    refetch,
  };
}
