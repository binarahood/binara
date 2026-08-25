'use client';

import { useEffect, useState } from 'react';
import { LivePool } from '@/lib/liveTypes';
import { usePoolsData, useChainStatus, DataStatus, DashboardMetrics } from './useChainData';

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

/** V1 uses verified subgraph REST polling; no persistent stream is required. */
export function usePoolStream() {
  const {
    pools,
    dashboardMetrics,
    isLoading: poolsLoading,
    error: poolsError,
    lastUpdated: lastPoolDataUpdate,
    secondsAgo,
    indexerStatus,
    refetch,
  } = usePoolsData(30_000);
  const { chainStatus } = useChainStatus();
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

  useEffect(() => {
    const hasRealPools = pools.length > 0;
    const poolDataStatus: StreamStatus['poolDataStatus'] = poolsError
      ? 'error'
      : hasRealPools
        ? 'live'
        : indexerStatus === 'indexing' || indexerStatus === 'connecting'
          ? 'indexing'
          : 'unknown';

    setStreamStatus({
      status: chainStatus.status,
      blockNumber: chainStatus.blockNumber,
      chainId: chainStatus.chainId,
      wsConnected: false,
      lastUpdated: chainStatus.lastUpdated,
      error: chainStatus.error ?? poolsError,
      indexerStatus,
      poolsDiscovered: pools.length,
      swapsIndexed: 0,
      poolDataStatus,
      lastPoolDataUpdate,
      hasRealPoolData: hasRealPools,
    });
  }, [chainStatus, pools, poolsError, indexerStatus, lastPoolDataUpdate]);

  return {
    pools,
    dashboardMetrics: dashboardMetrics as DashboardMetrics,
    streamStatus,
    isLoading: poolsLoading,
    error: poolsError,
    secondsAgo,
    refetch,
  };
}

export function useSinglePoolStream(poolAddress?: string) {
  const { pools, streamStatus, isLoading, error, secondsAgo, refetch } = usePoolStream();
  const [routeAddress, setRouteAddress] = useState<string | undefined>(poolAddress);

  useEffect(() => {
    if (poolAddress) {
      setRouteAddress(poolAddress);
      return;
    }
    const address = new URLSearchParams(window.location.search).get('address') || undefined;
    setRouteAddress(address);
  }, [poolAddress]);

  const pool = routeAddress
    ? pools.find((p: LivePool) => p.address.toLowerCase() === routeAddress.toLowerCase())
    : pools[0];

  return {
    pool: pool ?? null,
    streamStatus,
    isLoading,
    error,
    secondsAgo,
    refetch,
  };
}
