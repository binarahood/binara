'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

export interface WalletProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns?: string;
  provider: EthereumProvider;
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
  walletName: string | null;
  availableWallets: WalletProviderInfo[];
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

type EIP6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type WalletActions = {
  connect: (provider?: WalletProviderInfo) => Promise<void>;
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
  walletName: null,
  availableWallets: [],
};

function providerKey(detail: EIP6963ProviderDetail) {
  return detail.info.uuid || detail.info.rdns || detail.info.name;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(EMPTY_STATE);
  const [activeProvider, setActiveProvider] = useState<EthereumProvider | null>(null);

  const setPartial = useCallback((partial: Partial<WalletState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const loadBalances = useCallback(async (account: string) => {
    setPartial({ isLoadingBalances: true, error: null });
    try {
      const res = await fetch(`/api/chain/wallet?address=${account}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) {
        setPartial({ isLoadingBalances: false, error: data.error || 'Unable to retrieve wallet data from Robinhood Chain.', tokenBalances: [], lpPositions: [] });
        return;
      }
      setPartial({ ethBalance: data.ethBalance ?? null, tokenBalances: data.tokenBalances ?? [], lpPositions: data.lpPositions ?? [], isLoadingBalances: false, error: null });
    } catch {
      setPartial({ isLoadingBalances: false, error: 'Unable to retrieve wallet data from Robinhood Chain.', tokenBalances: [], lpPositions: [] });
    }
  }, [setPartial]);

  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accs = accounts as string[];
    if (!accs?.length) {
      setState((prev) => ({ ...EMPTY_STATE, availableWallets: prev.availableWallets }));
      return;
    }
    setPartial({ account: accs[0], isConnected: true, error: null });
    void loadBalances(accs[0]);
  }, [loadBalances, setPartial]);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    const id = parseInt(String(chainIdHex), 16);
    setPartial({ chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID });
  }, [setPartial]);

  const attachProvider = useCallback((provider: EthereumProvider, walletName: string) => {
    setActiveProvider(provider);
    setPartial({ walletName });
    provider.on?.('accountsChanged', handleAccountsChanged);
    provider.on?.('chainChanged', handleChainChanged);
  }, [handleAccountsChanged, handleChainChanged, setPartial]);

  const hydrate = useCallback(async (provider: EthereumProvider, walletName: string) => {
    try {
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      if (!accounts?.length) return false;
      const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const id = parseInt(chainIdHex, 16);
      attachProvider(provider, walletName);
      setPartial({ account: accounts[0], isConnected: true, chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID, error: null, walletName });
      void loadBalances(accounts[0]);
      return true;
    } catch {
      return false;
    }
  }, [attachProvider, loadBalances, setPartial]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const discovered = new Map<string, WalletProviderInfo>();
    let cancelled = false;

    const addProvider = (detail: EIP6963ProviderDetail) => {
      if (!detail?.provider || !detail.info?.name) return;
      const key = providerKey(detail);
      if (discovered.has(key)) return;
      discovered.set(key, { uuid: detail.info.uuid, name: detail.info.name, icon: detail.info.icon, rdns: detail.info.rdns, provider: detail.provider });
      setState((prev) => ({ ...prev, availableWallets: Array.from(discovered.values()) }));
    };

    const onAnnounce = (event: Event) => addProvider((event as CustomEvent<EIP6963ProviderDetail>).detail);
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Legacy fallback: browsers with one injected provider but no EIP-6963 announcement.
    if (window.ethereum) addProvider({ info: { uuid: 'injected', name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser Wallet', icon: '', rdns: 'injected' }, provider: window.ethereum });

    const hydrateFirst = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (cancelled) return;
      const wallets = Array.from(discovered.values());
      for (const wallet of wallets) {
        if (await hydrate(wallet.provider, wallet.name)) break;
      }
    };
    void hydrateFirst();

    return () => {
      cancelled = true;
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      if (activeProvider) {
        activeProvider.removeListener?.('accountsChanged', handleAccountsChanged);
        activeProvider.removeListener?.('chainChanged', handleChainChanged);
      }
    };
  }, [activeProvider, handleAccountsChanged, handleChainChanged, hydrate]);

  const connect = useCallback(async (selected?: WalletProviderInfo) => {
    const provider = selected?.provider ?? activeProvider ?? window.ethereum;
    if (!provider) {
      setPartial({ error: 'No compatible wallet detected. Install a browser wallet extension or use a wallet that supports EIP-6963.' });
      return;
    }
    setPartial({ isConnecting: true, error: null });
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts?.length) throw new Error('No wallet account was returned.');
      const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const id = parseInt(chainIdHex, 16);
      attachProvider(provider, selected?.name ?? state.walletName ?? (provider.isMetaMask ? 'MetaMask' : 'Browser Wallet'));
      setPartial({ account: accounts[0], isConnected: true, chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID, isConnecting: false, walletName: selected?.name ?? state.walletName ?? 'Browser Wallet' });
      await loadBalances(accounts[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setPartial({ isConnecting: false, error: msg });
    }
  }, [activeProvider, attachProvider, loadBalances, setPartial, state.walletName]);

  const disconnect = useCallback(() => {
    if (activeProvider) {
      activeProvider.removeListener?.('accountsChanged', handleAccountsChanged);
      activeProvider.removeListener?.('chainChanged', handleChainChanged);
    }
    setState((prev) => ({ ...EMPTY_STATE, availableWallets: prev.availableWallets }));
    setActiveProvider(null);
  }, [activeProvider, handleAccountsChanged, handleChainChanged]);

  const switchToRobinhoodChain = useCallback(async () => {
    const provider = activeProvider ?? window.ethereum;
    if (!provider) return;
    setPartial({ isSwitchingChain: true });
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ROBINHOOD_CHAIN_HEX }] });
    } catch (switchError: unknown) {
      if ((switchError as { code?: number }).code === 4902) {
        try {
          await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: ROBINHOOD_CHAIN_HEX, chainName: 'Robinhood Chain', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] }] });
        } catch (addError: unknown) {
          setPartial({ error: addError instanceof Error ? addError.message : 'Failed to add chain' });
        }
      } else {
        setPartial({ error: switchError instanceof Error ? switchError.message : 'Failed to switch network' });
      }
    } finally {
      setPartial({ isSwitchingChain: false });
    }
  }, [activeProvider, setPartial]);

  const value = useMemo<WalletContextValue>(() => ({ ...state, connect, disconnect, switchToRobinhoodChain }), [connect, disconnect, state, switchToRobinhoodChain]);
  return React.createElement(WalletContext.Provider, { value }, children);
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider');
  return context;
}
