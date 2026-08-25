'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import MetricCard from '@/components/ui/MetricCard';
import TopPoolsTable from '@/app/components/TopPoolsTable';
import { usePoolStream } from '@/hooks/usePoolStream';

function formatUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function MainDashboardPage() {
  const { pools, dashboardMetrics, isLoading, error, secondsAgo, streamStatus } = usePoolStream();
  const hasData = !isLoading && !error && pools.length > 0;
  const { totalTVL, avgFeeTier } = dashboardMetrics;
  const poolDataStatus = streamStatus.poolDataStatus;
  const gmgnPools = pools.filter((pool) => pool.gmgn !== null).length;
  const gmgnEnabled = gmgnPools > 0;

  const statusLabel = isLoading
    ? 'CONNECTING'
    : error
      ? 'CHAIN ERROR'
      : poolDataStatus === 'live'
        ? `LIVE DATA${secondsAgo !== null ? ` • ${secondsAgo}s ago` : ''}`
        : poolDataStatus === 'indexing'
          ? 'POOL DATA SYNCING'
          : 'NO POOL DATA';

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Market Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              BINARA · DLMM Liquidity Infrastructure on Robinhood Chain · Chain ID 4663
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              error
                ? 'bg-destructive/10 border-destructive/40'
                : poolDataStatus === 'live'
                  ? 'bg-positive-subtle border-positive/30'
                  : 'bg-muted/40 border-border'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                error ? 'bg-destructive' : poolDataStatus === 'live' ? 'bg-positive animate-pulse' : 'bg-muted-foreground'
              }`} />
              <span className={`text-xs font-semibold ${
                error ? 'text-destructive' : poolDataStatus === 'live' ? 'text-positive' : 'text-muted-foreground'
              }`}>{statusLabel}</span>
            </div>
            {streamStatus.blockNumber && (
              <span className="text-xs text-muted-foreground font-mono-nums hidden lg:inline">
                Block #{streamStatus.blockNumber.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p>
            <p className="text-xs text-destructive/80 mt-0.5">Unable to retrieve live Robinhood Chain pool data.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Tracked TVL"
            value={isLoading ? '…' : hasData ? formatUSD(totalTVL) : 'N/A'}
            subValue={hasData ? `${pools.length} pools` : 'Awaiting live pool data'}
            icon="CircleStackIcon"
            variant="default"
            size="lg"
            className="lg:col-span-2"
          />
          <MetricCard
            label="Tracked Pools"
            value={isLoading ? '…' : pools.length.toString()}
            subValue="Robinhood DLMM"
            icon="Squares2X2Icon"
            variant="info"
          />
          <MetricCard
            label="Avg Fee Tier"
            value={isLoading ? '…' : hasData ? `${avgFeeTier.toFixed(2)}%` : 'N/A'}
            subValue="TVL weighted"
            icon="ReceiptPercentIcon"
            variant="default"
          />
          <MetricCard
            label="24h Volume"
            value="N/A"
            subValue="24h swap indexing not enabled in V1"
            icon="ArrowsRightLeftIcon"
            variant="default"
          />
          <MetricCard
            label="Vol / TVL"
            value="N/A"
            subValue="Requires 24h swap history"
            icon="BoltIcon"
            variant="warning"
          />
          <MetricCard
            label="Estimated APR"
            value="N/A"
            subValue="Requires fee history"
            icon="TrophyIcon"
            variant="default"
          />
          <MetricCard
            label="Price Volatility"
            value="N/A"
            subValue="Requires price history"
            icon="ExclamationTriangleIcon"
            variant="default"
          />

          <div className="lg:col-span-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Realtime Market Data</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verified Robinhood subgraph snapshots enriched with external token metadata when available.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">REST · 30s refresh</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <p className="text-xs text-muted-foreground">Pool discovery</p>
                <p className="text-sm font-semibold text-foreground mt-1">{pools.length} pools</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <p className="text-xs text-muted-foreground">Data source</p>
                <p className="text-sm font-semibold text-foreground mt-1">Robinhood Subgraph</p>
              </div>
              <div className={`rounded-lg border p-3 ${gmgnEnabled ? 'bg-positive-subtle border-positive/20' : 'bg-muted/30 border-border'}`}>
                <p className="text-xs text-muted-foreground">GMGN enrichment</p>
                <p className={`text-sm font-semibold mt-1 ${gmgnEnabled ? 'text-positive' : 'text-foreground'}`}>
                  {isLoading ? '…' : gmgnEnabled ? `${gmgnPools} pools enriched` : 'Not available'}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <p className="text-xs text-muted-foreground">Chain</p>
                <p className="text-sm font-semibold text-foreground mt-1">4663 · Robinhood Chain</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold text-foreground">Pool Explorer</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Live pool metadata with GMGN token enrichment where the upstream API returns data.
              </p>
            </div>
            <a href="/pool-scanner" className="btn-ghost text-xs">Full Scanner →</a>
          </div>
          <TopPoolsTable />
        </div>

        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4">
          <p className="text-xs text-warning/80 leading-relaxed">
            <span className="font-semibold text-warning">V1 DATA NOTICE:</span>{' '}
            Binara presents verified source values and clearly marks unavailable metrics as N/A.
            GMGN enrichment is supplementary token metadata; it does not replace authoritative pool TVL or DLMM state.
            This dashboard is informational and is not financial advice.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
