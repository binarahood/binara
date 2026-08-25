'use client';

import { useEffect, useState } from 'react';
import { LivePool } from '@/lib/liveTypes';
import { usePoolsData, useChainStatus, DataStatus, DashboardMetrics } from './useChainData';

export interface StreamStatus { status: DataStatus; blockNumber: number | null; chainId: number | null; wsConnected: boolean; lastUpdated: number | null; error: string | null; indexerStatus: string | null; poolsDiscovered: number; swapsIndexed: number; poolDataStatus: 'unknown' | 'indexing' | 'live' | 'error'; lastPoolDataUpdate: number | null; hasRealPoolData: boolean; }

export function usePoolStream() {
  const { pools, dashboardMetrics, isLoading: poolsLoading, error: poolsError, lastUpdated: lastPoolDataUpdate, secondsAgo, indexerStatus, refetch } = usePoolsData(30_000);
  const { chainStatus } = useChainStatus();
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ status: 'connecting', blockNumber: null, chainId: null, wsConnected: false, lastUpdated: null, error: null, indexerStatus: null, poolsDiscovered: 0, swapsIndexed: 0, poolDataStatus: 'unknown', lastPoolDataUpdate: null, hasRealPoolData: false });
  useEffect(() => { const hasRealPools = pools.length > 0; const poolDataStatus: StreamStatus['poolDataStatus'] = poolsError ? 'error' : hasRealPools ? 'live' : indexerStatus === 'indexing' || indexerStatus === 'connecting' ? 'indexing' : 'unknown'; setStreamStatus({ status: chainStatus.status, blockNumber: chainStatus.blockNumber, chainId: chainStatus.chainId, wsConnected: false, lastUpdated: chainStatus.lastUpdated, error: chainStatus.error ?? poolsError, indexerStatus, poolsDiscovered: pools.length, swapsIndexed: 0, poolDataStatus, lastPoolDataUpdate, hasRealPoolData: hasRealPools }); }, [chainStatus, pools, poolsError, indexerStatus, lastPoolDataUpdate]);
  return { pools, dashboardMetrics: dashboardMetrics as DashboardMetrics, streamStatus, isLoading: poolsLoading, error: poolsError, secondsAgo, refetch };
}

function fromSearchResult(result: Record<string, unknown>): LivePool {
  const address = String(result.address || '');
  return {
    id: String(result.id || address), address, pair: String(result.pair || `${result.tokenA || 'Unknown'}/${result.tokenB || 'Unknown'}`), tokenA: String(result.tokenA || 'Unknown'), tokenB: String(result.tokenB || 'Unknown'), tokenAName: result.tokenAName ? String(result.tokenAName) : null, tokenBName: result.tokenBName ? String(result.tokenBName) : null,
    tokenAAddress: String(result.tokenAAddress || ''), tokenBAddress: String(result.tokenBAddress || ''), decimalsA: 18, decimalsB: 18, protocol: String(result.protocol || 'Robinhood DLMM'), currentPrice: typeof result.currentPrice === 'number' ? result.currentPrice : null, priceChange24h: typeof result.priceChange24h === 'number' ? result.priceChange24h : null, binStep: typeof result.binStep === 'number' ? result.binStep : 0, activeBin: typeof result.activeBin === 'number' ? result.activeBin : null, fee: typeof result.fee === 'number' ? result.fee : 0, tvl: typeof result.tvl === 'number' ? result.tvl : null, reserveX: '0', reserveY: '0', volume1h: null, volume6h: null, volume24h: typeof result.volume24h === 'number' ? result.volume24h : null, volumeRaw24h: typeof result.volume24h === 'number' ? result.volume24h : 0, volumeToTVL: typeof result.volumeToTVL === 'number' ? result.volumeToTVL : null, volatility: typeof result.priceChange24h === 'number' ? Math.abs(result.priceChange24h) : null, analyticsScore: null, riskLevel: null, estimatedAPR: null, timeInRange: null, gmgn: null, swapCount24h: null, swapCount1h: null, status: 'active', createdBlock: 0, createdAt: null, updatedAt: new Date().toISOString(),
  };
}

export function useSinglePoolStream(poolAddress?: string) {
  const { pools, streamStatus, isLoading, error, secondsAgo, refetch } = usePoolStream();
  const [routeAddress, setRouteAddress] = useState<string | undefined>(poolAddress);
  const [discoveredPool, setDiscoveredPool] = useState<LivePool | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  useEffect(() => { if (poolAddress) { setRouteAddress(poolAddress); return; } const address = new URLSearchParams(window.location.search).get('address') || undefined; setRouteAddress(address); }, [poolAddress]);

  const indexedPool = routeAddress ? pools.find((candidate: LivePool) => candidate.address?.toLowerCase() === routeAddress.toLowerCase()) : undefined;

  useEffect(() => {
    if (!routeAddress || indexedPool || isLoading) return;
    const controller = new AbortController();
    setDiscovering(true); setDiscoveryError(null);
    fetch(`/api/chain/pool-search?q=${encodeURIComponent(routeAddress)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body?.error || 'Pool discovery failed'); return body; })
      .then((body) => { const result = Array.isArray(body.results) ? body.results[0] : null; if (result) setDiscoveredPool(fromSearchResult(result)); else setDiscoveryError('This pool could not be verified from the available live sources.'); })
      .catch((err) => { if ((err as Error).name !== 'AbortError') setDiscoveryError((err as Error).message || 'Pool discovery failed'); })
      .finally(() => setDiscovering(false));
    return () => controller.abort();
  }, [routeAddress, indexedPool, isLoading]);

  const pool = indexedPool ?? discoveredPool;
  return { pool: pool ?? null, routeAddress: routeAddress ?? null, streamStatus: { ...streamStatus, status: discovering ? 'connecting' : streamStatus.status, error: discoveryError ?? streamStatus.error }, isLoading: isLoading || discovering, error: error ?? discoveryError, secondsAgo, refetch };
}
