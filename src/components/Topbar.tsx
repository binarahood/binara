'use client';

import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useWallet, WalletProviderInfo } from '@/hooks/useWallet';
import { useChainStatus } from '@/hooks/useChainData';

function shortenAddress(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function formatEth(val: string | null) {
  if (!val) return '—';
  return parseFloat(val).toFixed(4) + ' ETH';
}

function DataStatusBadge() {
  const { chainStatus } = useChainStatus();
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => { if (chainStatus.lastUpdated) setSecondsAgo(Math.floor((Date.now() - chainStatus.lastUpdated) / 1000)); }, 1000);
    return () => clearInterval(id);
  }, [chainStatus.lastUpdated]);
  if (chainStatus.status === 'connecting') return <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/40 border border-border"><div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" /><span className="text-[10px] sm:text-xs text-muted-foreground font-semibold">CONNECTING</span></div>;
  if (chainStatus.status === 'error') return <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-destructive/10 border border-destructive"><div className="w-2 h-2 rounded-full bg-destructive" /><span className="text-[10px] sm:text-xs text-destructive font-semibold">ERROR</span></div>;
  if (chainStatus.status === 'stale') return <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warning-subtle border border-warning"><div className="w-2 h-2 rounded-full bg-warning" /><span className="text-[10px] sm:text-xs text-warning font-semibold">STALE</span></div>;
  return <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-positive-subtle border border-positive/30"><div className="live-dot" /><span className="text-[10px] sm:text-xs text-positive font-semibold">LIVE<span className="hidden sm:inline">{secondsAgo !== null ? ` • Updated ${secondsAgo}s ago` : ' DATA'}</span></span></div>;
}

function WalletIcon({ wallet }: { wallet: WalletProviderInfo }) {
  if (wallet.icon) return <img src={wallet.icon} alt="" className="w-8 h-8 rounded-lg" />;
  return <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"><Icon name="WalletIcon" size={17} /></div>;
}

export default function Topbar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletChooserOpen, setWalletChooserOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { chainStatus } = useChainStatus();
  const { isConnected, isConnecting, account, chainId, isCorrectChain, ethBalance, tokenBalances, lpPositions, isSwitchingChain, isLoadingBalances, error, connect, disconnect, switchToRobinhoodChain, availableWallets, walletName } = useWallet();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setWalletOpen(false);
    }
    if (walletOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [walletOpen]);

  const chooseWallet = async (wallet: WalletProviderInfo) => {
    setWalletChooserOpen(false);
    await connect(wallet);
  };

  return (
    <header className="h-14 sm:h-16 flex items-center justify-between gap-2 px-3 sm:px-6 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30 min-w-0">
      <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0 overflow-hidden">
        <span className="hidden sm:inline text-muted-foreground">BINARA</span>
        <Icon name="ChevronRightIcon" size={14} className="hidden sm:block text-muted-foreground/50" />
        <span className="text-foreground font-medium truncate">Analytics Terminal</span>
        <span className="ml-1 sm:ml-2 flex-shrink-0"><DataStatusBadge /></span>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <button suppressHydrationWarning onClick={() => setSearchOpen(!searchOpen)} className="btn-ghost px-2 sm:px-3" title="Search pools (Cmd+K)"><Icon name="MagnifyingGlassIcon" size={16} />{!searchOpen && <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground/60"><kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs">⌘K</kbd></span>}</button>
        <button suppressHydrationWarning className="btn-ghost px-2 sm:px-3 relative" title="Alerts (2 active)"><Icon name="BellIcon" size={16} /><span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning" /></button>
        {chainStatus.blockNumber && <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border"><Icon name="CubeIcon" size={12} className="text-muted-foreground" /><span className="text-xs text-muted-foreground font-mono-nums">#{chainStatus.blockNumber.toLocaleString()}</span></div>}

        {isConnected && !isCorrectChain && <button suppressHydrationWarning onClick={switchToRobinhoodChain} disabled={isSwitchingChain} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive text-destructive text-xs font-semibold disabled:opacity-60" title={`Wrong network (chain ${chainId}). Click to switch to Robinhood Chain (4663)`}><Icon name="ExclamationTriangleIcon" size={13} /><span className="hidden sm:inline">{isSwitchingChain ? 'Switching…' : 'Wrong Network'}</span></button>}

        {!isConnected ? (
          <button suppressHydrationWarning onClick={() => setWalletChooserOpen(true)} disabled={isConnecting} className="btn-primary text-xs px-2.5 sm:px-3 py-1.5 disabled:opacity-60"><Icon name="WalletIcon" size={14} /><span className="hidden sm:inline">{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span></button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button suppressHydrationWarning onClick={() => setWalletOpen((v) => !v)} className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${isCorrectChain ? 'bg-positive-subtle border-positive text-positive hover:bg-positive/20' : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isCorrectChain ? 'bg-positive' : 'bg-muted-foreground'}`} /><span className="hidden sm:inline font-mono-nums">{shortenAddress(account!)}</span><Icon name="ChevronDownIcon" size={12} />
            </button>
            {walletOpen && <div className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] max-w-80 rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between"><div><p className="text-xs text-muted-foreground mb-0.5">Connected Account</p><p className="text-sm font-mono-nums text-foreground font-semibold">{shortenAddress(account!)}</p><p className="text-[10px] text-muted-foreground mt-0.5">{walletName ?? 'Browser Wallet'}</p></div><div className="text-right"><p className="text-xs text-muted-foreground mb-0.5">Network</p>{isCorrectChain ? <span className="text-xs font-semibold text-positive flex items-center gap-1 justify-end"><span className="w-1.5 h-1.5 rounded-full bg-positive inline-block" />Robinhood Chain</span> : <span className="text-xs font-semibold text-destructive">Chain {chainId}</span>}</div></div>
              <div className="px-4 py-3 border-b border-border"><p className="text-xs text-muted-foreground mb-1">ETH Balance</p>{isLoadingBalances ? <div className="h-5 w-24 rounded bg-muted animate-pulse" /> : <p className="text-lg font-bold text-foreground font-mono-nums">{formatEth(ethBalance)}</p>}</div>
              {tokenBalances.length > 0 && <div className="px-4 py-3 border-b border-border"><p className="text-xs text-muted-foreground mb-2">Token Balances</p>{isLoadingBalances ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-4 rounded bg-muted animate-pulse" />)}</div> : <div className="space-y-1.5">{tokenBalances.map((t) => <div key={t.symbol} className="flex items-center justify-between"><span className="text-xs font-semibold text-foreground">{t.symbol}</span><div className="text-right"><span className="text-xs font-mono-nums text-foreground">{t.balance}</span>{t.usdValue !== undefined && <span className="text-xs text-muted-foreground ml-1.5">${t.usdValue.toLocaleString()}</span>}</div></div>)}</div>}</div>}
              <div className="px-4 py-3 border-b border-border"><p className="text-xs text-muted-foreground mb-2">LP Positions</p>{lpPositions.length === 0 ? <p className="text-xs text-muted-foreground">No active positions.</p> : <div className="space-y-2">{lpPositions.slice(0, 3).map((p) => <div key={p.poolAddress} className="rounded-lg bg-muted/30 p-2"><p className="text-xs font-mono text-foreground truncate">{p.poolAddress}</p></div>)}</div>}</div>
              {error && <div className="px-4 py-3 border-b border-border"><p className="text-xs text-destructive">{error}</p></div>}
              <div className="p-3 flex gap-2"><button suppressHydrationWarning onClick={() => { setWalletOpen(false); setWalletChooserOpen(true); }} className="flex-1 btn-secondary text-xs">Switch Wallet</button><button suppressHydrationWarning onClick={() => { disconnect(); setWalletOpen(false); }} className="flex-1 btn-secondary text-xs">Disconnect</button></div>
            </div>}
          </div>
        )}
      </div>

      {walletChooserOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Choose wallet">
        <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between flex-shrink-0"><div className="min-w-0"><h2 className="text-sm font-semibold text-foreground">Connect Wallet</h2><p className="text-xs text-muted-foreground mt-1 truncate">Choose an installed EIP-6963 wallet.</p></div><button onClick={() => setWalletChooserOpen(false)} className="btn-ghost p-2 flex-shrink-0"><Icon name="XMarkIcon" size={16} /></button></div>
          <div className="p-3 sm:p-4 space-y-2 overflow-y-auto overscroll-contain">
            {availableWallets.length === 0 ? <div className="rounded-xl border border-border bg-muted/20 p-4 text-center"><Icon name="WalletIcon" size={24} className="mx-auto mb-2 text-muted-foreground" /><p className="text-sm font-medium text-foreground">No compatible wallet detected</p><p className="text-xs text-muted-foreground mt-1">Install a wallet extension that supports EIP-6963, then reopen this dialog.</p></div> : availableWallets.map((wallet) => <button key={wallet.uuid} onClick={() => chooseWallet(wallet)} disabled={isConnecting} className="w-full flex items-center gap-3 rounded-xl border border-border bg-card hover:bg-muted/40 p-3 text-left transition-colors disabled:opacity-60"><WalletIcon wallet={wallet} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground truncate">{wallet.name}</p><p className="text-[10px] text-muted-foreground truncate">{wallet.rdns ?? 'EIP-6963 provider'}</p></div><Icon name="ChevronRightIcon" size={14} className="text-muted-foreground flex-shrink-0" /></button>)}
            <div className="rounded-xl border border-dashed border-border p-3 mt-3"><p className="text-[11px] font-semibold text-muted-foreground">WalletConnect</p><p className="text-[10px] text-muted-foreground mt-1">Mobile WalletConnect support will be enabled after a WalletConnect project ID is configured; no placeholder connection is shown.</p></div>
          </div>
        </div>
      </div>}
    </header>
  );
}
