'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useWallet } from '@/hooks/useWallet';
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
    const id = setInterval(() => {
      if (chainStatus.lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - chainStatus.lastUpdated) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [chainStatus.lastUpdated]);

  if (chainStatus.status === 'connecting') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border">
        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        <span className="text-xs text-muted-foreground font-semibold">CONNECTING</span>
      </div>
    );
  }

  if (chainStatus.status === 'error') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive" title={chainStatus.error ?? undefined}>
        <div className="w-2 h-2 rounded-full bg-destructive" />
        <span className="text-xs text-destructive font-semibold">DATA CONNECTION ERROR</span>
      </div>
    );
  }

  if (chainStatus.status === 'stale') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning">
        <div className="w-2 h-2 rounded-full bg-warning" />
        <span className="text-xs text-warning font-semibold">STALE DATA</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
      <div className="live-dot" />
      <span className="text-xs text-positive font-semibold">
        LIVE{secondsAgo !== null ? ` • Updated ${secondsAgo}s ago` : ' DATA'}
      </span>
    </div>
  );
}

export default function Topbar() {
  const [walletOpen, setWalletOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { chainStatus } = useChainStatus();

  const {
    isConnected,
    isConnecting,
    account,
    chainId,
    isCorrectChain,
    ethBalance,
    tokenBalances,
    lpPositions,
    isSwitchingChain,
    isLoadingBalances,
    connect,
    disconnect,
    switchToRobinhoodChain,
  } = useWallet();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWalletOpen(false);
      }
    }
    if (walletOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [walletOpen]);

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">BINARA</span>
        <Icon name="ChevronRightIcon" size={14} className="text-muted-foreground/50" />
        <span className="text-foreground font-medium">Analytics Terminal</span>
        <span className="ml-2"><DataStatusBadge /></span>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/pool-scanner" className="btn-ghost" title="Open Pool Scanner">
          <Icon name="MagnifyingGlassIcon" size={16} />
          <span className="hidden md:inline text-xs">Pool Scanner</span>
        </Link>

        {chainStatus.blockNumber && (
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border">
            <Icon name="CubeIcon" size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-mono-nums">#{chainStatus.blockNumber.toLocaleString()}</span>
          </div>
        )}

        {isConnected && !isCorrectChain && (
          <button
            suppressHydrationWarning
            onClick={switchToRobinhoodChain}
            disabled={isSwitchingChain}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-60"
            title={`Wrong network (chain ${chainId}). Click to switch to Robinhood Chain (4663)`}
          >
            <Icon name="ExclamationTriangleIcon" size={13} />
            <span className="hidden sm:inline">{isSwitchingChain ? 'Switching…' : 'Wrong Network'}</span>
          </button>
        )}

        {!isConnected ? (
          <button
            suppressHydrationWarning
            onClick={connect}
            disabled={isConnecting}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60"
          >
            <Icon name="WalletIcon" size={14} />
            <span className="hidden sm:inline">{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
          </button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              suppressHydrationWarning
              onClick={() => setWalletOpen((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                isCorrectChain
                  ? 'bg-positive-subtle border-positive text-positive hover:bg-positive/20'
                  : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isCorrectChain ? 'bg-positive' : 'bg-muted-foreground'}`} />
              <span className="hidden sm:inline font-mono-nums">{shortenAddress(account!)}</span>
              <Icon name="ChevronDownIcon" size={12} />
            </button>

            {walletOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Connected Account</p>
                    <p className="text-sm font-mono-nums text-foreground font-semibold">{shortenAddress(account!)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-0.5">Network</p>
                    {isCorrectChain ? (
                      <span className="text-xs font-semibold text-positive flex items-center gap-1 justify-end"><span className="w-1.5 h-1.5 rounded-full bg-positive inline-block" />Robinhood Chain</span>
                    ) : (
                      <span className="text-xs font-semibold text-destructive">Chain {chainId}</span>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-muted-foreground mb-1">ETH Balance</p>
                  {isLoadingBalances ? <div className="h-5 w-24 rounded bg-muted animate-pulse" /> : <p className="text-lg font-bold text-foreground font-mono-nums">{formatEth(ethBalance)}</p>}
                </div>

                {tokenBalances.length > 0 && (
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-2">Token Balances</p>
                    {isLoadingBalances ? (
                      <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-4 rounded bg-muted animate-pulse" />)}</div>
                    ) : (
                      <div className="space-y-1.5">
                        {tokenBalances.map((t) => (
                          <div key={t.symbol} className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">{t.symbol}</span>
                            <div className="text-right"><span className="text-xs font-mono-nums text-foreground">{t.balance}</span>{t.usdValue !== undefined && <span className="text-xs text-muted-foreground ml-1.5">${t.usdValue.toLocaleString()}</span>}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-muted-foreground mb-2">LP Positions <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold">{lpPositions.length}</span></p>
                  {isLoadingBalances ? (
                    <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
                  ) : lpPositions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No LP positions found</p>
                  ) : (
                    <div className="space-y-2">
                      {lpPositions.map((pos) => (
                        <div key={pos.poolAddress} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border">
                          <div><p className="text-xs font-semibold text-foreground">{pos.pair}</p><p className="text-xs text-muted-foreground">{pos.fee}% fee</p></div>
                          <div className="text-right"><p className="text-xs font-mono-nums text-foreground font-semibold">${pos.usdValue.toLocaleString()}</p><span className={`text-xs font-medium ${pos.inRange ? 'text-positive' : 'text-warning'}`}>{pos.inRange ? '● In Range' : '○ Out of Range'}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-4 py-3">
                  <button
                    suppressHydrationWarning
                    onClick={() => { disconnect(); setWalletOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
                  >
                    <Icon name="ArrowRightOnRectangleIcon" size={13} />Disconnect Wallet
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}