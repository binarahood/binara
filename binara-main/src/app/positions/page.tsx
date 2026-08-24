'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useWallet } from '@/hooks/useWallet';
import { usePositions, DLMMPosition } from '@/hooks/usePositions';
import Icon from '@/components/ui/AppIcon';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  return `${n.toFixed(2)}%`;
}

function fmtTokenAmount(amount: string, symbol: string): string {
  const n = parseFloat(amount);
  if (isNaN(n)) return `0 ${symbol}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K ${symbol}`;
  if (n >= 1) return `${n.toFixed(4)} ${symbol}`;
  return `${n.toFixed(8)} ${symbol}`;
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Network Warning ──────────────────────────────────────────────────────────

function NetworkWarning({ chainId, onSwitch }: { chainId: number | null; onSwitch: () => void }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
      <Icon name="ExclamationTriangleIcon" size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-300">Wrong Network</p>
        <p className="text-xs text-amber-400/80 mt-0.5">
          Connected to chain ID {chainId ?? 'unknown'}. BINARA requires Robinhood Chain (Chain ID 4663).
        </p>
      </div>
      <button
        onClick={onSwitch}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-colors"
      >
        Switch Network
      </button>
    </div>
  );
}

// ─── Position Detail Panel ────────────────────────────────────────────────────

function PositionDetail({ pos, onClose }: { pos: DLMMPosition; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="CircleStackIcon" size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">{pos.pair}</h2>
              <p className="text-xs text-muted-foreground font-mono-nums">{truncAddr(pos.poolAddress)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors"
          >
            <Icon name="XMarkIcon" size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            {pos.inRange ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-positive/10 border border-positive/30 text-positive text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                In Range
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-negative/10 border border-negative/30 text-negative text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-negative" />
                Out of Range
              </span>
            )}
            <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted/40 border border-border">
              {pos.dataSource === 'subgraph' ? '📡 Subgraph' : '⛓ RPC'}
            </span>
          </div>

          {/* Pool info */}
          <div className="bg-muted/20 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Pool</h3>
            <Row label="Pool Address" value={truncAddr(pos.poolAddress)} mono />
            <Row label="Token Pair" value={pos.pair} />
            <Row label="Fee Tier" value={`${pos.fee.toFixed(2)}%`} />
            <Row label="Bin Step" value={String(pos.binStep)} />
          </div>

          {/* Price info */}
          <div className="bg-muted/20 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Price</h3>
            <Row label="Current Price" value={fmtPrice(pos.currentPrice)} highlight />
            <Row label="Active Bin" value={pos.activeBin !== null ? String(pos.activeBin) : 'N/A'} mono />
            <Row label="Lower Bound" value={fmtPrice(pos.lowerPrice)} />
            <Row label="Upper Bound" value={fmtPrice(pos.upperPrice)} />
            <Row
              label="Distance to Lower"
              value={pos.distToLowerPct !== null ? fmtPct(pos.distToLowerPct) : 'N/A'}
              positive={pos.distToLowerPct !== null && pos.distToLowerPct > 0}
              negative={pos.distToLowerPct !== null && pos.distToLowerPct <= 0}
            />
            <Row
              label="Distance to Upper"
              value={pos.distToUpperPct !== null ? fmtPct(pos.distToUpperPct) : 'N/A'}
              positive={pos.distToUpperPct !== null && pos.distToUpperPct > 0}
              negative={pos.distToUpperPct !== null && pos.distToUpperPct <= 0}
            />
          </div>

          {/* Liquidity */}
          <div className="bg-muted/20 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Your Liquidity</h3>
            <Row label={pos.tokenASymbol} value={fmtTokenAmount(pos.tokenAAmount, pos.tokenASymbol)} mono />
            <Row label={pos.tokenBSymbol} value={fmtTokenAmount(pos.tokenBAmount, pos.tokenBSymbol)} mono />
            {pos.currentValueUSD !== null && (
              <Row label="Current Value" value={`$${pos.currentValueUSD.toFixed(2)}`} highlight />
            )}
          </div>

          {/* Bins */}
          <div className="bg-muted/20 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Bin Range</h3>
            <Row label="Lower Bin" value={pos.lowerBin !== null ? String(pos.lowerBin) : 'N/A'} mono />
            <Row label="Upper Bin" value={pos.upperBin !== null ? String(pos.upperBin) : 'N/A'} mono />
            <Row label="Active Bins" value={pos.userBins.length > 0 ? `${pos.userBins.length} bins` : 'N/A'} />
          </div>

          {/* Unclaimed Fees */}
          <div className="bg-muted/20 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Unclaimed Fees</h3>
            <Row label={pos.tokenASymbol} value={fmtTokenAmount(pos.unclaimedFeeA, pos.tokenASymbol)} mono positive={parseFloat(pos.unclaimedFeeA) > 0} />
            <Row label={pos.tokenBSymbol} value={fmtTokenAmount(pos.unclaimedFeeB, pos.tokenBSymbol)} mono positive={parseFloat(pos.unclaimedFeeB) > 0} />
            {pos.unclaimedFeeUSD !== null && (
              <Row label="Fee Value" value={`$${pos.unclaimedFeeUSD.toFixed(2)}`} positive />
            )}
          </div>

          {/* Data note */}
          <p className="text-xs text-muted-foreground/50 text-center">
            Read-only · On-chain data · Robinhood Chain 4663
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
  positive,
  negative,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span
        className={`text-xs text-right truncate max-w-[200px] ${
          mono ? 'font-mono-nums' : ''
        } ${
          highlight
            ? 'text-foreground font-semibold'
            : positive
            ? 'text-positive font-semibold'
            : negative
            ? 'text-negative font-semibold' :'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ pos, onClick }: { pos: DLMMPosition; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-muted/20 transition-all duration-150 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="CircleStackIcon" size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{pos.pair}</p>
            <p className="text-xs text-muted-foreground font-mono-nums">{pos.fee.toFixed(2)}% fee · {pos.binStep} step</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {pos.inRange ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-positive/10 border border-positive/30 text-positive text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
              In Range
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-negative/10 border border-negative/30 text-negative text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-negative" />
              Out of Range
            </span>
          )}
          <Icon name="ChevronRightIcon" size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
      </div>

      {/* Token amounts */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-muted/30 rounded-lg p-2.5">
          <p className="text-xs text-muted-foreground mb-0.5">{pos.tokenASymbol}</p>
          <p className="text-sm font-mono-nums font-semibold text-foreground truncate">
            {fmtTokenAmount(pos.tokenAAmount, '')}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-2.5">
          <p className="text-xs text-muted-foreground mb-0.5">{pos.tokenBSymbol}</p>
          <p className="text-sm font-mono-nums font-semibold text-foreground truncate">
            {fmtTokenAmount(pos.tokenBAmount, '')}
          </p>
        </div>
      </div>

      {/* Price range */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono-nums">
          {fmtPrice(pos.lowerPrice)} – {fmtPrice(pos.upperPrice)}
        </span>
        <span className="font-mono-nums">
          Current: {fmtPrice(pos.currentPrice)}
        </span>
      </div>

      {/* Unclaimed fees */}
      {(parseFloat(pos.unclaimedFeeA) > 0 || parseFloat(pos.unclaimedFeeB) > 0) && (
        <div className="mt-2.5 pt-2.5 border-t border-border/50 flex items-center gap-1.5">
          <Icon name="CurrencyDollarIcon" size={12} className="text-positive" />
          <span className="text-xs text-positive font-semibold">
            Unclaimed: {fmtTokenAmount(pos.unclaimedFeeA, pos.tokenASymbol)} + {fmtTokenAmount(pos.unclaimedFeeB, pos.tokenBSymbol)}
          </span>
        </div>
      )}

      {/* Pool address */}
      <p className="mt-2 text-xs text-muted-foreground/40 font-mono-nums">{truncAddr(pos.poolAddress)}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FACTORY_ADDRESS = '0xdcD5F77697914E27f56FD263EF82923C8524AbAc';

export default function PositionsPage() {
  const { isConnected, isConnecting, account, chainId, isCorrectChain, switchToRobinhoodChain } = useWallet();
  const { positions, isLoading, isRefreshing, error, dataSource, lastUpdated, refresh } = usePositions(
    account,
    chainId
  );
  const [selectedPosition, setSelectedPosition] = useState<DLMMPosition | null>(null);

  const inRangeCount = positions.filter((p) => p.inRange).length;

  const lastUpdatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">DLMM Positions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isConnected && isCorrectChain
                ? `${positions.length} position${positions.length !== 1 ? 's' : ''} · ${inRangeCount} in range`
                : isConnected && !isCorrectChain
                ? 'Switch to Robinhood Chain to view positions' :'Connect your wallet to view positions'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Data source badge */}
            {isConnected && isCorrectChain && !isLoading && (
              <span className="text-xs text-muted-foreground/60 px-2 py-1 rounded-full bg-muted/30 border border-border">
                {dataSource === 'subgraph' ? '📡 Subgraph' : dataSource === 'rpc' ? '⛓ RPC' : '—'}
              </span>
            )}

            {/* Last updated */}
            {lastUpdatedStr && (
              <span className="text-xs text-muted-foreground/50 font-mono-nums">
                Updated {lastUpdatedStr}
              </span>
            )}

            {/* Wallet badge */}
            {isConnected && account && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-positive/10 border border-positive/20">
                <span className="w-2 h-2 rounded-full bg-positive animate-pulse" />
                <span className="text-xs font-mono-nums text-positive font-semibold">
                  {account.slice(0, 6)}…{account.slice(-4)}
                </span>
              </div>
            )}

            {/* Refresh button */}
            {isConnected && isCorrectChain && (
              <button
                onClick={refresh}
                disabled={isLoading || isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Icon
                  name="ArrowPathIcon"
                  size={13}
                  className={isRefreshing ? 'animate-spin' : ''}
                />
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Network warning */}
        {isConnected && !isCorrectChain && (
          <NetworkWarning chainId={chainId} onSwitch={switchToRobinhoodChain} />
        )}

        {/* Not connected */}
        {!isConnected && !isConnecting && (
          <div className="bg-card border border-border rounded-2xl p-16 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center">
              <Icon name="WalletIcon" size={28} className="text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Connect your wallet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Connect MetaMask to Robinhood Chain (Chain ID 4663) to view your real DLMM positions.
              </p>
            </div>
          </div>
        )}

        {/* Connecting */}
        {isConnecting && (
          <div className="bg-card border border-border rounded-2xl p-16 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Connecting wallet…</p>
          </div>
        )}

        {/* Loading positions */}
        {isConnected && isCorrectChain && isLoading && (
          <div className="bg-card border border-border rounded-2xl p-16 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Scanning DLMM positions…</p>
              <p className="text-xs text-muted-foreground mt-1">
                Querying Ramses DLMM factory on Robinhood Chain
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {isConnected && isCorrectChain && !isLoading && error && (
          <div className="bg-negative/5 border border-negative/20 rounded-xl p-4 flex items-start gap-3">
            <Icon name="ExclamationCircleIcon" size={18} className="text-negative flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-negative">Failed to load positions</p>
              <p className="text-xs text-negative/70 mt-0.5 font-mono-nums">{error}</p>
            </div>
            <button
              onClick={refresh}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-negative/10 hover:bg-negative/20 text-negative text-xs font-semibold border border-negative/20 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Connected — no positions */}
        {isConnected && isCorrectChain && !isLoading && !error && positions.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-16 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
              <Icon name="CircleStackIcon" size={24} className="text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">No DLMM positions found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                No active Ramses DLMM liquidity positions were detected for this wallet on Robinhood Chain.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <span className="font-mono-nums">{account?.slice(0, 6)}…{account?.slice(-4)}</span>
              <span>·</span>
              <span>Chain 4663</span>
              <span>·</span>
              <span>Factory {FACTORY_ADDRESS.slice(0, 6)}…{FACTORY_ADDRESS.slice(-4)}</span>
            </div>
          </div>
        )}

        {/* Positions grid */}
        {isConnected && isCorrectChain && !isLoading && positions.length > 0 && (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total Positions"
                value={String(positions.length)}
                sub={`${inRangeCount} in range`}
                icon="CircleStackIcon"
              />
              <SummaryCard
                label="In Range"
                value={String(inRangeCount)}
                sub={`${positions.length - inRangeCount} out of range`}
                icon="CheckCircleIcon"
                positive={inRangeCount > 0}
              />
              <SummaryCard
                label="Pools"
                value={String(new Set(positions.map((p) => p.poolAddress)).size)}
                sub="unique pools"
                icon="BuildingLibraryIcon"
              />
              <SummaryCard
                label="Data Source"
                value={dataSource === 'subgraph' ? 'Subgraph' : dataSource === 'rpc' ? 'RPC' : '—'}
                sub="Ramses DLMM"
                icon="SignalIcon"
              />
            </div>

            {/* Positions header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="CircleStackIcon" size={16} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground">Active Positions</h2>
                {isRefreshing && (
                  <Icon name="ArrowPathIcon" size={13} className="text-muted-foreground animate-spin" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-positive/10 text-positive text-xs font-semibold border border-positive/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                  {inRangeCount} In Range
                </span>
                {positions.length - inRangeCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-negative/10 text-negative text-xs font-semibold border border-negative/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-negative" />
                    {positions.length - inRangeCount} Out of Range
                  </span>
                )}
              </div>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {positions.map((pos) => (
                <PositionCard
                  key={pos.positionId}
                  pos={pos}
                  onClick={() => setSelectedPosition(pos)}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground/50">
              <span>{positions.length} position{positions.length !== 1 ? 's' : ''} · read-only · on-chain data</span>
              <span className="font-mono-nums">Robinhood Chain · 4663 · Factory {FACTORY_ADDRESS.slice(0, 6)}…{FACTORY_ADDRESS.slice(-4)}</span>
            </div>
          </>
        )}
      </div>

      {/* Position detail modal */}
      {selectedPosition && (
        <PositionDetail
          pos={selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </AppLayout>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: string;
}

function SummaryCard({ label, value, sub, positive, icon }: SummaryCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/70">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center">
          <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} className="text-muted-foreground" />
        </div>
      </div>
      <span className={`text-xl font-bold font-mono-nums ${positive ? 'text-positive' : 'text-foreground'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
