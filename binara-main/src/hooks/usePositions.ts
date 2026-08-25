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
    positions: [], isLoading: false, isRefreshing: false, error: null,
    walletAddress: null, chainId: null, isCorrectChain: false,
    dataSource: 'none', lastUpdated: null, positionCount: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCorrectChain = chainId === ROBINHOOD_CHAIN_ID;

  const fetchPositions = useCallback(async (isRefresh = false) => {
    if (!walletAddress || !isCorrectChain) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, isLoading: !isRefresh, isRefreshing: isRefresh, error: null, walletAddress, chainId, isCorrectChain: true }));
    try {
      const res = await fetch(`/api/chain/positions?address=${encodeURIComponent(walletAddress)}`, {
        cache: 'no-store', signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (controller.signal.aborted) return;
      const nextPositions: DLMMPosition[] = Array.isArray(data.positions) ? data.positions : [];
      setState((prev) => ({
        ...prev,
        positions: nextPositions,
        isLoading: false,
        isRefreshing: false,
        error: null,
        walletAddress,
        chainId,
        isCorrectChain: true,
        dataSource: data.dataSource || 'none',
        lastUpdated: data.timestamp || Date.now(),
        positionCount: typeof data.positionCount === 'number' ? data.positionCount : nextPositions.length,
      }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setState((prev) => ({ ...prev, isLoading: false, isRefreshing: false, error: err instanceof Error ? err.message : 'Failed to fetch positions' }));
    }
  }, [walletAddress, isCorrectChain, chainId]);

  useEffect(() => {
    // Clear immediately when account/network changes so the previous wallet's
    // positions can never remain visible while the new wallet is loading.
    setState((prev) => ({
      ...prev,
      positions: [], isLoading: !!walletAddress && isCorrectChain, isRefreshing: false,
      error: null, walletAddress, chainId, isCorrectChain,
      dataSource: 'none', lastUpdated: null, positionCount: 0,
    }));
    abortRef.current?.abort();
    if (walletAddress && isCorrectChain) fetchPositions(false);
    // fetchPositions is intentionally included: it is stable for this wallet/chain pair.
  }, [walletAddress, chainId, isCorrectChain, fetchPositions]);

  useEffect(() => {
    if (!walletAddress || !isCorrectChain) return;
    refreshTimerRef.current = setInterval(() => fetchPositions(true), 15_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchPositions(true); };
    const onFocus = () => fetchPositions(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [walletAddress, isCorrectChain, fetchPositions]);

  useEffect(() => () => { abortRef.current?.abort(); if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); }, []);

  const refresh = useCallback(() => fetchPositions(true), [fetchPositions]);
  return { ...state, refresh };
}
