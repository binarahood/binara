'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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

type WalletActions = {
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToRobinhoodChain: () => Promise<void>;
};

type WalletContextValue = WalletState & WalletActions;

const WalletContext = createContext<WalletContextValue | null>(null);

const EMPTY_STATE: WalletState = {
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
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(EMPTY_STATE);

  const setPartial = useCallback((partial: Partial<WalletState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const loadBalances = useCallback(async (account: string) => {
    if (!window.ethereum) return;
    setPartial({ isLoadingBalances: true, error: null });
    try {
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
  }, [setPartial]);

  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accs = accounts as string[];
    if (!accs || accs.length === 0) {
      setState(EMPTY_STATE);
      return;
    }

    setPartial({ account: accs[0], isConnected: true, error: null });
    void loadBalances(accs[0]);
  }, [loadBalances, setPartial]);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    const id = parseInt(chainIdHex as string, 16);
    setPartial({ chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID });
  }, [setPartial]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    let cancelled = false;

    const hydrate = async () => {
      try {
        const accounts = (await window.ethereum!.request({ method: 'eth_accounts' })) as string[];
        if (cancelled || !accounts?.length) return;

        const chainIdHex = (await window.ethereum!.request({ method: 'eth_chainId' })) as string;
        if (cancelled) return;

        const id = parseInt(chainIdHex, 16);
        setPartial({
          account: accounts[0],
          isConnected: true,
          chainId: id,
          isCorrectChain: id === ROBINHOOD_CHAIN_ID,
          error: null,
        });
        void loadBalances(accounts[0]);
      } catch {
        // Wallet providers may reject passive account discovery; keep the UI disconnected.
      }
    };

    void hydrate();
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      cancelled = true;
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [handleAccountsChanged, handleChainChanged, loadBalances, setPartial]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setPartial({ error: 'No wallet detected. Please install MetaMask or Rabby.' });
      return;
    }

    setPartial({ isConnecting: true, error: null });
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts?.length) throw new Error('No wallet account was returned.');

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
  }, [loadBalances, setPartial]);

  const disconnect = useCallback(() => {
    // Clear BINARA's shared UI state without disconnecting the wallet extension itself.
    setState(EMPTY_STATE);
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
      if ((switchError as { code?: number }).code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ROBINHOOD_CHAIN_HEX,
              chainName: 'Robinhood Chain',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
              blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
            }],
          });
        } catch (addError: unknown) {
          const msg = addError instanceof Error ? addError.message : 'Failed to add chain';
          setPartial({ error: msg });
        }
      }
    } finally {
      setPartial({ isSwitchingChain: false });
    }
  }, [setPartial]);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    switchToRobinhoodChain,
  };

  return React.createElement(WalletContext.Provider, { value }, children);
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used inside WalletProvider');
  }
  return context;
}
