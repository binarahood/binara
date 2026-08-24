'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ROBINHOOD_CHAIN_ID } from './useWallet';

export interface DLMMPosition {
  positionId: string;
  poolAddress: string;
  pair: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAddress: string;
  tokenBAddress: string;
  decimalsA: number;
  decimalsB: number;
  fee: number;
  binStep: number;
  activeBin: number | null;
  userBins: number[];
  lowerBin: number | null;
  upperBin: number | null;
  lowerPrice: number | null;
  upperPrice: number | null;
  currentPrice: number | null;
  tokenAAmount: string;
  tokenBAmount: string;
  tokenARaw: string;
  tokenBRaw: string;
  currentValueUSD: number | null;
  unclaimedFeeA: string;
  unclaimedFeeB: string;
  unclaimedFeeARaw: string;
  unclaimedFeeBRaw: string;
  unclaimedFeeUSD: number | null;
  inRange: boolean;
  distToLowerPct: number | null;
  distToUpperPct: number | null;
  dataSource: 'subgraph' | 'rpc';
}

export interface PositionsState {
  positions: DLMMPosition[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  walletAddress: string | null;
  chainId: number | null;
  isCorrectChain: boolean;
  dataSource: 'subgraph' | 'rpc' | 'none';
  lastUpdated: number | null;
  positionCount: number;
}

export function usePositions(walletAddress: string | null, chainId: number | null) {
  const [state, setState] = useState<PositionsState>({
    positions: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    walletAddress: null,
    chainId: null,
    isCorrectChain: false,
    dataSource: 'none',
    lastUpdated: null,
    positionCount: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCorrectChain = chainId === ROBINHOOD_CHAIN_ID;

  const fetchPositions = useCallback(
    async (isRefresh = false) => {
      if (!walletAddress || !isCorrectChain) return;

      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setState((prev) => ({
        ...prev,
        isLoading: !isRefresh,
        isRefreshing: isRefresh,
        error: null,
      }));

      try {
        const res = await fetch(`/api/chain/positions?address=${walletAddress}`, {
          cache: 'no-store',
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        setState((prev) => ({
          ...prev,
          positions: data.positions || [],
          isLoading: false,
          isRefreshing: false,
          error: null,
          walletAddress,
          chainId,
          isCorrectChain: true,
          dataSource: data.dataSource || 'none',
          lastUpdated: data.timestamp || Date.now(),
          positionCount: data.positionCount || 0,
        }));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: err instanceof Error ? err.message : 'Failed to fetch positions',
        }));
      }
    },
    [walletAddress, isCorrectChain, chainId]
  );

  // Initial fetch when wallet connects or chain changes
  useEffect(() => {
    if (walletAddress && isCorrectChain) {
      fetchPositions(false);
    } else {
      setState((prev) => ({
        ...prev,
        positions: [],
        isLoading: false,
        isRefreshing: false,
        error: null,
        walletAddress,
        chainId,
        isCorrectChain,
        dataSource: 'none',
        lastUpdated: null,
        positionCount: 0,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, isCorrectChain]);

  // Periodic refresh every 30 seconds when connected
  useEffect(() => {
    if (!walletAddress || !isCorrectChain) return;

    refreshTimerRef.current = setInterval(() => {
      fetchPositions(true);
    }, 30_000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [walletAddress, isCorrectChain, fetchPositions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  const refresh = useCallback(() => fetchPositions(true), [fetchPositions]);

  return { ...state, refresh };
}
