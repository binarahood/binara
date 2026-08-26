'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createCoinbaseWalletProvider, ensureRobinhoodChain } from '@/lib/externalWallets';

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = '0x' + ROBINHOOD_CHAIN_ID.toString(16); // 0x1237
const USER_DISCONNECTED_STORAGE_KEY = 'binara.wallet.userDisconnected.v1';

export interface TokenBalance { symbol: string; address: string; balance: string; decimals: number; usdValue?: number; }
export interface LPPosition {
  poolAddress: string; pair: string; tokenA: string; tokenB: string; liquidity: string; usdValue: number; fee: number; inRange: boolean;
  capital: number; currentValue: number; pnl: number; feesEarned: number; ilVsHodl: number; currentPrice: number; rangeLower: number;
  rangeUpper: number; distToLower: number; distToUpper: number; protocol?: string; positionId?: string; unrealizedPnl?: number;
  realizedPnl?: number; entryDataAvailable?: boolean;
}
export type ExternalWalletKind = 'coinbase';
export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  disconnect?: () => Promise<void> | void;
  isMetaMask?: boolean;
  isTronLink?: boolean;
}
export interface WalletProviderInfo { uuid: string; name: string; icon: string; rdns?: string; provider: EthereumProvider; kind?: ExternalWalletKind; }
export interface WalletState {
  isConnected: boolean; isConnecting: boolean; account: string | null; chainId: number | null; isCorrectChain: boolean;
  ethBalance: string | null; tokenBalances: TokenBalance[]; lpPositions: LPPosition[]; isSwitchingChain: boolean;
  isLoadingBalances: boolean; error: string | null; walletName: string | null; availableWallets: WalletProviderInfo[];
}
type EIP6963ProviderDetail = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EthereumProvider; };
declare global {
  interface Window { ethereum?: EthereumProvider; tron?: EthereumProvider; tronLink?: EthereumProvider; }
}
type WalletActions = { connect: (provider?: WalletProviderInfo) => Promise<void>; disconnect: () => void; switchToRobinhoodChain: () => Promise<void>; };
type WalletContextValue = WalletState & WalletActions;
const WalletContext = createContext<WalletContextValue | null>(null);
const EMPTY_STATE: WalletState = {
  isConnected: false, isConnecting: false, account: null, chainId: null, isCorrectChain: false, ethBalance: null,
  tokenBalances: [], lpPositions: [], isSwitchingChain: false, isLoadingBalances: false, error: null, walletName: null, availableWallets: [],
};
function providerKey(detail: EIP6963ProviderDetail) { return detail.info.uuid || detail.info.rdns || detail.info.name; }
function isTronLinkProvider(detail: EIP6963ProviderDetail) {
  const name = detail.info.name?.trim().toLowerCase();
  const rdns = detail.info.rdns?.trim().toLowerCase();
  return name === 'tronlink' || rdns === 'org.tronlink.www' || Boolean(detail.provider.isTronLink);
}
function isInjectedTronLink(provider: EthereumProvider) {
  return Boolean(provider.isTronLink) || provider === window.tron || provider === window.tronLink;
}
const pseudoProvider = {} as EthereumProvider;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>(EMPTY_STATE);
  const [activeProvider, setActiveProvider] = useState<EthereumProvider | null>(null);
  const activeProviderRef = useRef<EthereumProvider | null>(null);
  const userDisconnectedRef = useRef(false);

  const setPartial = useCallback((partial: Partial<WalletState>) => setState((prev) => ({ ...prev, ...partial })), []);

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
    if (userDisconnectedRef.current) return;
    setPartial({ account: accs[0], isConnected: true, error: null });
    void loadBalances(accs[0]);
  }, [loadBalances, setPartial]);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    const id = parseInt(String(chainIdHex), 16);
    if (!userDisconnectedRef.current) setPartial({ chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID });
  }, [setPartial]);

  const attachProvider = useCallback((provider: EthereumProvider, walletName: string) => {
    activeProviderRef.current = provider;
    setActiveProvider(provider);
    setPartial({ walletName });
    provider.on?.('accountsChanged', handleAccountsChanged);
    provider.on?.('chainChanged', handleChainChanged);
  }, [handleAccountsChanged, handleChainChanged, setPartial]);

  const hydrate = useCallback(async (provider: EthereumProvider, walletName: string) => {
    if (userDisconnectedRef.current || isInjectedTronLink(provider)) return false;
    try {
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      if (!accounts?.length || userDisconnectedRef.current) return false;
      const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const id = parseInt(chainIdHex, 16);
      if (userDisconnectedRef.current) return false;
      attachProvider(provider, walletName);
      setPartial({ account: accounts[0], isConnected: true, chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID, error: null, walletName });
      void loadBalances(accounts[0]);
      return true;
    } catch { return false; }
  }, [attachProvider, loadBalances, setPartial]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { userDisconnectedRef.current = window.localStorage.getItem(USER_DISCONNECTED_STORAGE_KEY) === '1'; }
    catch { userDisconnectedRef.current = false; }

    const discovered = new Map<string, WalletProviderInfo>();
    let cancelled = false;
    const addProvider = (detail: EIP6963ProviderDetail) => {
      if (!detail?.provider || !detail.info?.name || isTronLinkProvider(detail)) return;
      const key = providerKey(detail);
      if (discovered.has(key)) return;
      discovered.set(key, { uuid: detail.info.uuid, name: detail.info.name, icon: detail.info.icon, rdns: detail.info.rdns, provider: detail.provider });
      setState((prev) => ({ ...prev, availableWallets: Array.from(discovered.values()) }));
    };
    const onAnnounce = (event: Event) => addProvider((event as CustomEvent<EIP6963ProviderDetail>).detail);
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if (window.ethereum && !isInjectedTronLink(window.ethereum)) {
      addProvider({ info: { uuid: 'injected', name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser Wallet', icon: '', rdns: 'injected' }, provider: window.ethereum });
    }
    const hydrateFirst = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (cancelled) return;
      const discoveredValues = Array.from(discovered.values());
      const hasCoinbaseInjected = discoveredValues.some((wallet) => wallet.name.toLowerCase().includes('coinbase'));
      const merged = [...discoveredValues.filter((wallet) => !wallet.name.toLowerCase().includes('tronlink'))];
      if (!hasCoinbaseInjected) merged.push({ uuid: 'coinbase-wallet-sdk', name: 'Coinbase Wallet', icon: '', rdns: 'com.coinbase.wallet', provider: pseudoProvider, kind: 'coinbase' });
      setState((prev) => ({ ...prev, availableWallets: merged }));
      if (userDisconnectedRef.current) return;
      for (const wallet of discoveredValues) {
        if (await hydrate(wallet.provider, wallet.name)) break;
      }
    };
    void hydrateFirst();
    return () => {
      cancelled = true;
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      const provider = activeProviderRef.current;
      if (provider) {
        provider.removeListener?.('accountsChanged', handleAccountsChanged);
        provider.removeListener?.('chainChanged', handleChainChanged);
      }
    };
  }, [handleAccountsChanged, handleChainChanged, hydrate]);

  const connect = useCallback(async (selected?: WalletProviderInfo) => {
    userDisconnectedRef.current = false;
    try { window.localStorage.removeItem(USER_DISCONNECTED_STORAGE_KEY); } catch { /* storage may be unavailable */ }
    setPartial({ isConnecting: true, error: null });
    try {
      let provider: EthereumProvider;
      let selectedName = selected?.name ?? state.walletName ?? 'Browser Wallet';
      if (selected?.kind === 'coinbase') {
        provider = await createCoinbaseWalletProvider();
        selectedName = 'Coinbase Wallet';
      } else {
        provider = selected?.provider ?? activeProviderRef.current ?? window.ethereum as EthereumProvider;
        if (!provider || isInjectedTronLink(provider)) throw new Error('No compatible EVM wallet detected. TronLink is not supported by Binara.');
      }

      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts?.length) throw new Error('No wallet account was returned.');
      await ensureRobinhoodChain(provider);
      const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const id = parseInt(chainIdHex, 16);
      attachProvider(provider, selectedName);
      setPartial({ account: accounts[0], isConnected: true, chainId: id, isCorrectChain: id === ROBINHOOD_CHAIN_ID, isConnecting: false, walletName: selectedName });
      await loadBalances(accounts[0]);
    } catch (err: unknown) {
      setPartial({ isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' });
    }
  }, [attachProvider, loadBalances, setPartial, state.walletName]);

  const disconnect = useCallback(() => {
    userDisconnectedRef.current = true;
    try { window.localStorage.setItem(USER_DISCONNECTED_STORAGE_KEY, '1'); } catch { /* storage may be unavailable */ }
    const provider = activeProviderRef.current;
    if (provider) {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
      void provider.disconnect?.();
    }
    activeProviderRef.current = null;
    setActiveProvider(null);
    setState((prev) => ({ ...EMPTY_STATE, availableWallets: prev.availableWallets }));
  }, [handleAccountsChanged, handleChainChanged]);

  const switchToRobinhoodChain = useCallback(async () => {
    const provider = activeProviderRef.current ?? window.ethereum;
    if (!provider || isInjectedTronLink(provider)) return;
    setPartial({ isSwitchingChain: true });
    try { await ensureRobinhoodChain(provider); }
    catch (switchError: unknown) { setPartial({ error: switchError instanceof Error ? switchError.message : 'Failed to switch network' }); }
    finally { setPartial({ isSwitchingChain: false }); }
  }, [setPartial]);

  const value = useMemo<WalletContextValue>(() => ({ ...state, connect, disconnect, switchToRobinhoodChain }), [connect, disconnect, state, switchToRobinhoodChain]);
  return React.createElement(WalletContext.Provider, { value }, children);
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside WalletProvider');
  return context;
}
