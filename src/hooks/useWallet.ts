'use client';

import { useState, useEffect, useCallback } from 'react';

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = '0x' + ROBINHOOD_CHAIN_ID.toString(16); // 0x1237

export interface TokenBalance {
  symbol: string;
  address: string;
  balance: string;
  decimals: number;
  usdValue?: number;
}

export interface LPPosition {
  poolAddress: string;
  pair: string;
  tokenA: string;
  tokenB: string;
  liquidity: string;
  usdValue: number;
  fee: number;
  inRange: boolean;
  // Extended position metrics
  capital: number;
  currentValue: number;
  pnl: number;
  feesEarned: number;
  ilVsHodl: number;
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  distToLower: number;
  distToUpper: number;
  protocol?: string;
  positionId?: string;
  unrealizedPnl?: number;
  realizedPnl?: number;
  entryDataAvailable?: boolean;
}

export interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  account: string | null;
  chainId: number | null;
  isCorrectChain: boolean;
  ethBalance: string | null;
  tokenBalances: TokenBalance[];
  lpPositions: LPPosition[];
  isSwitchingChain: boolean;
  isLoadingBalances: boolean;
  error: string | null;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function useWallet(): WalletState & {
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToRobinhoodChain: () => Promise<void>;
} {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    isConnecting: false,
    account: null,
    chainId: null,
    isCorrectChain: false,
    ethBalance: null,
    tokenBalances: [],
    lpPositions: [],
    isSwitchingChain: false,
    isLoadingBalances: false,
    error: null,
  });

  const setPartial = (partial: Partial<WalletState>) =>
    setState((prev) => ({ ...prev, ...partial }));

  const loadBalances = useCallback(async (account: string) => {
    if (!window.ethereum) return;
    setPartial({ isLoadingBalances: true, error: null });
    try {
      // Fetch real wallet data from server-side API route
      const res = await fetch(`/api/chain/wallet?address=${account}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || data.error) {
        setPartial({
          isLoadingBalances: false,
          error: data.error || 'Unable to retrieve wallet data from Robinhood Chain.',
          tokenBalances: [],
          lpPositions: [],
        });
        return;
      }

      setPartial({
        ethBalance: data.ethBalance ?? null,
        tokenBalances: data.tokenBalances ?? [],
        lpPositions: data.lpPositions ?? [],
        isLoadingBalances: false,
        error: null,
      });
    } catch {
      setPartial({
        isLoadingBalances: false,
        error: 'Unable to retrieve wallet data from Robinhood Chain.',
        tokenBalances: [],
        lpPositions: [],
      });
    }
  }, []);

  const handleAccountsChanged = useCallback(
    (accounts: unknown) => {
      const accs = accounts as string[];
      if (!accs || accs.length === 0) {
        setState({
          isConnected: false,
          isConnecting: false,
          account: null,
          chainId: null,
          isCorrectChain: false,
          ethBalance: null,
          tokenBalances: [],
          lpPositions: [],
          isSwitchingChain: false,
          isLoadingBalances: false,
          error: null,
        });
      } else {
        setPartial({ account: accs[0], isConnected: true });
        loadBalances(accs[0]);
      }
    },
    [loadBalances]
  );

  const handleChainChanged = useCallback(
    (chainIdHex: unknown) => {
      const id = parseInt(chainIdHex as string, 16);
      setPartial({ chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID });
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        const accs = accounts as string[];
        if (accs && accs.length > 0) {
          window.ethereum!.request({ method: 'eth_chainId' }).then((chainIdHex) => {
            const id = parseInt(chainIdHex as string, 16);
            setPartial({
              account: accs[0],
              isConnected: true,
              chainId: id,
              isCorrectChain: id === ROBINHOOD_CHAIN_ID,
            });
            loadBalances(accs[0]);
          });
        }
      })
      .catch(() => {});

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [handleAccountsChanged, handleChainChanged, loadBalances]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setPartial({ error: 'No wallet detected. Please install MetaMask or Rabby.' });
      return;
    }
    setPartial({ isConnecting: true, error: null });
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const chainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      const id = parseInt(chainIdHex, 16);
      setPartial({
        account: accounts[0],
        isConnected: true,
        chainId: id,
        isCorrectChain: id === ROBINHOOD_CHAIN_ID,
        isConnecting: false,
      });
      await loadBalances(accounts[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setPartial({ isConnecting: false, error: msg });
    }
  }, [loadBalances]);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      isConnecting: false,
      account: null,
      chainId: null,
      isCorrectChain: false,
      ethBalance: null,
      tokenBalances: [],
      lpPositions: [],
      isSwitchingChain: false,
      isLoadingBalances: false,
      error: null,
    });
  }, []);

  const switchToRobinhoodChain = useCallback(async () => {
    if (!window.ethereum) return;
    setPartial({ isSwitchingChain: true });
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ROBINHOOD_CHAIN_HEX }],
      });
    } catch (switchError: unknown) {
      // Chain not added — add it
      if ((switchError as { code?: number }).code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: ROBINHOOD_CHAIN_HEX,
                chainName: 'Robinhood Chain',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
                blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
              },
            ],
          });
        } catch (addError: unknown) {
          const msg = addError instanceof Error ? addError.message : 'Failed to add chain';
          setPartial({ error: msg });
        }
      }
    } finally {
      setPartial({ isSwitchingChain: false });
    }
  }, []);

  return { ...state, connect, disconnect, switchToRobinhoodChain };
}
