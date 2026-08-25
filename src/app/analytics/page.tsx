'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useWallet } from '@/hooks/useWallet';
import { usePositions } from '@/hooks/usePositions';

function fmt$(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}K`;
  return `${n < 0 ? '-$' : '$'}${abs.toFixed(decimals)}`;
}

function fmtToken(raw: string, symbol: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `N/A ${symbol}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K ${symbol}`;
  if (n >= 1) return `${n.toFixed(4)} ${symbol}`;
  return `${n.toFixed(8)} ${symbol}`;
}

function SummaryCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/70">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center">
          <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} className="text-muted-foreground" />
        </div>
      </div>
      <span className="text-xl font-bold font-mono-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const { isConnected, isConnecting, account, chainId } = useWallet();
  const { positions, isLoading, isRefreshing, error, dataSource, lastUpdated, refresh } = usePositions(account, chainId);

  if (!isConnected && !isConnecting) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
            <Icon name="PresentationChartLineIcon" size={28} className="text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Connect your wallet</h2>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Connect your wallet to inspect the live state of your Robinhood Chain DLMM positions.
          </p>
        </div>
      </AppLayout>
    );
  }

  const totalCurrentValue = positions.reduce((sum, p) => sum + (p.currentValueUSD ?? 0), 0);
  const totalUnclaimedFees = positions.reduce((sum, p) => sum + (p.unclaimedFeeUSD ?? 0), 0);
  const inRangeCount = positions.filter((p) => p.inRange).length;
  const pricedCount = positions.filter((p) => p.currentPrice !== null).length;
  const lastUpdatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Analytics</h1>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-muted/40 text-muted-foreground border border-border">V1 LIVE SNAPSHOT</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Current DLMM position state from Robinhood Chain. Historical performance is not fabricated.
            </p>
          </div>
          <button
            onClick={() => refresh()}
            disabled={isLoading || isRefreshing || !account || chainId !== 4663}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Icon name="ArrowPathIcon" size={14} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Position data unavailable</p>
              <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Positions" value={isLoading ? '…' : String(positions.length)} sub={`${inRangeCount} currently in range`} icon="CircleStackIcon" />
          <SummaryCard label="Current Value" value={isLoading ? '…' : positions.length ? fmt$(totalCurrentValue) : 'N/A'} sub={positions.length ? `${pricedCount}/${positions.length} positions priced` : 'No live positions'} icon="BanknotesIcon" />
          <SummaryCard label="Unclaimed Fees" value={isLoading ? '…' : positions.length ? fmt$(totalUnclaimedFees) : 'N/A'} sub="Currently claimable estimate" icon="CurrencyDollarIcon" />
          <SummaryCard label="Data Source" value={isLoading ? '…' : dataSource === 'none' ? 'NONE' : dataSource.toUpperCase()} sub={lastUpdatedStr ? `Updated ${lastUpdatedStr}` : 'Waiting for data'} icon="SignalIcon" />
        </div>

        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4">
          <div className="flex items-start gap-3">
            <Icon name="InformationCircleIcon" size={17} className="text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-warning">Historical analytics are intentionally disabled in V1</p>
              <p className="text-xs text-warning/80 mt-1 max-w-3xl">
                Cumulative PnL, realized PnL, historical fees, APR, APY, transaction history, and performance charts require a persistent historical data/indexer path. BINARA will not infer those values from a current snapshot.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Live Position Snapshot</h2>
              <p className="text-xs text-muted-foreground mt-0.5">On-chain position state exposed by the current V1 data path.</p>
            </div>
            <span className="text-xs text-muted-foreground font-mono-nums">{positions.length} positions</span>
          </div>

          {isLoading ? (
            <div className="p-10 flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">Fetching live positions…</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="p-10 flex flex-col items-center gap-3">
              <Icon name="CircleStackIcon" size={28} className="text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No live DLMM positions found</p>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                This is a real-data empty state. It does not imply historical PnL or fees are zero.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Pool</th>
                    <th className="px-4 py-3 font-semibold">Range</th>
                    <th className="px-4 py-3 font-semibold">Current Price</th>
                    <th className="px-4 py-3 font-semibold">Liquidity</th>
                    <th className="px-4 py-3 font-semibold">Unclaimed Fees</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.positionId} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-foreground">{p.pair}</p>
                        <p className="text-xs text-muted-foreground font-mono-nums">{p.fee.toFixed(2)}% fee · {p.binStep} step</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono-nums text-foreground">
                        {p.lowerPrice !== null && p.upperPrice !== null ? `${fmt$(p.lowerPrice, 6)} – ${fmt$(p.upperPrice, 6)}` : 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono-nums text-foreground">{fmt$(p.currentPrice, 6)}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-xs font-mono-nums text-foreground">{fmtToken(p.tokenAAmount, p.tokenASymbol)}</p>
                        <p className="text-xs font-mono-nums text-muted-foreground">{fmtToken(p.tokenBAmount, p.tokenBSymbol)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono-nums text-positive">{p.unclaimedFeeUSD !== null ? fmt$(p.unclaimedFeeUSD) : 'N/A'}</td>
                      <td className="px-4 py-3.5">
                        {p.inRange ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-positive/10 border border-positive/30 text-positive text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" /> In Range</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-negative/10 border border-negative/30 text-negative text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-negative" /> Out of Range</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Next data-layer milestone:</span>{' '}
            persist pool swaps and position events so BINARA can calculate historical volume, fee accrual, realized/unrealized PnL, IL vs HODL, and eventually APR from measured data rather than estimates.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
