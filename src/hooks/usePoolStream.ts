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

/**
 * V1 data hook.
 *
 * Robinhood pool discovery is currently backed by the verified subgraph API.
 * V1 intentionally uses simple REST polling instead of an SSE/WebSocket layer
 * because the serverless deployment does not expose a persistent stream.
 */
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
  const pool = poolAddress
    ? pools.find((p: LivePool) => p.address.toLowerCase() === poolAddress.toLowerCase())
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
