'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import MetricCard from '@/components/ui/MetricCard';
import TopPoolsTable from '@/app/components/TopPoolsTable';
import ActivityFeed from '@/app/components/ActivityFeed';
import dynamic from 'next/dynamic';
import { usePoolStream } from '@/hooks/usePoolStream';
import DiagnosticPanel from '@/app/components/DiagnosticPanel';

// Backend integration point: replace with live Robinhood Chain RPC/indexer
const VolumeChart = dynamic(() => import('@/app/components/VolumeChart'), { ssr: false });

function formatUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function MainDashboardPage() {
  const { dashboardMetrics, isLoading, error, secondsAgo, streamStatus } = usePoolStream();

  const {
    totalTVL,
    volume24h,
    avgFeeTier,
    highestVolTVL,
    highestVolTVLPair,
    bestFeePool,
    bestFeeAPR,
    bestFeeScore,
    mostVolatilePair,
    mostVolatileChange,
  } = dashboardMetrics;

  const hasData = !isLoading && !error && totalTVL > 0;

  // Derive status badge configuration from granular pool data status
  const { poolDataStatus, hasRealPoolData, lastPoolDataUpdate, wsConnected, blockNumber: streamBlock } = streamStatus;
  const chainLive = !isLoading && !error && (streamStatus.status === 'live' || streamStatus.status === 'stale');

  // Format last pool data update timestamp
  const lastPoolUpdateLabel = (() => {
    if (!lastPoolDataUpdate) return null;
    const d = new Date(lastPoolDataUpdate);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  })();

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Market Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              BINARA · DLMM Liquidity Infrastructure on Robinhood Chain · Chain ID 4663
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Status badges — multi-state system */}
            {isLoading ? (
              /* Connecting state */
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                <span className="text-xs text-muted-foreground font-semibold">CONNECTING</span>
              </div>
            ) : error ? (
              /* Full connection error */
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/40">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-xs text-destructive font-semibold">CHAIN ERROR</span>
              </div>
            ) : poolDataStatus === 'live' && hasRealPoolData ? (
              /* Real pool data available — show LIVE DATA */
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
                <div className="live-dot" />
                <span className="text-xs text-positive font-semibold">
                  LIVE DATA{secondsAgo !== null ? ` • ${secondsAgo}s ago` : ''}
                </span>
              </div>
            ) : poolDataStatus === 'error' ? (
              /* Pool API/indexer failed */
              <>
                {chainLive && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
                    <div className="live-dot" />
                    <span className="text-xs text-positive font-semibold">CHAIN LIVE</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/40">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span className="text-xs text-destructive font-semibold">POOL DATA ERROR</span>
                </div>
              </>
            ) : poolDataStatus === 'indexing' || poolDataStatus === 'unknown' ? (
              /* Chain live but pool indexer still syncing */
              <>
                {chainLive && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
                    <div className="live-dot" />
                    <span className="text-xs text-positive font-semibold">CHAIN LIVE</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30">
                  <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  <span className="text-xs text-warning font-semibold">
                    {poolDataStatus === 'indexing' ? 'POOL INDEXER SYNCING' : 'POOL INDEXER SYNCING'}
                  </span>
                </div>
              </>
            ) : streamStatus.status === 'stale' ? (
              /* Stale data fallback */
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <span className="text-xs text-warning font-semibold">STALE DATA</span>
              </div>
            ) : null}

            {/* Last pool data update timestamp — only shown when real pool data is available */}
            {hasRealPoolData && lastPoolUpdateLabel && (
              <span className="text-xs text-muted-foreground font-mono-nums hidden lg:inline">
                Last pool data: {lastPoolUpdateLabel}
              </span>
            )}

            {/* Block number — always shown when available */}
            {streamStatus.blockNumber && (
              <span className="text-xs text-muted-foreground font-mono-nums hidden lg:inline">
                Block #{streamStatus.blockNumber.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <span className="text-destructive text-lg flex-shrink-0">🔴</span>
            <div>
              <p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p>
              <p className="text-xs text-destructive/80 mt-0.5">Unable to retrieve live Robinhood Chain data. {error}</p>
            </div>
          </div>
        )}

        {/* Bento grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
          {/* Hero: Total TVL */}
          <MetricCard
            label="Total Tracked TVL"
            value={isLoading ? '…' : hasData ? formatUSD(totalTVL) : 'N/A'}
            subValue={hasData ? `Across ${highestVolTVLPair !== 'N/A' ? 'active' : '0'} pools` : 'Awaiting live data'}
            change={hasData ? 3.24 : undefined}
            changeLabel="24h"
            icon="CircleStackIcon"
            variant="default"
            size="lg"
            className="lg:col-span-2"
          />
          {/* 24h Volume */}
          <MetricCard
            label="24h Volume"
            value={isLoading ? '…' : hasData ? formatUSD(volume24h) : 'N/A'}
            subValue="Robinhood Chain"
            change={hasData ? 12.8 : undefined}
            changeLabel="24h"
            icon="ArrowsRightLeftIcon"
            variant="positive"
          />
          {/* Pool count */}
          <MetricCard
            label="Tracked Pools"
            value={isLoading ? '…' : 'N/A'}
            subValue="Pool indexer required"
            icon="Squares2X2Icon"
            variant="info"
          />
          {/* Avg fee */}
          <MetricCard
            label="Avg Fee Tier"
            value={isLoading ? '…' : hasData ? `${avgFeeTier.toFixed(2)}%` : 'N/A'}
            subValue="Weighted by TVL"
            icon="ReceiptPercentIcon"
            variant="default"
          />
          {/* Highest Vol/TVL */}
          <MetricCard
            label="Highest Vol/TVL"
            value={isLoading ? '…' : hasData ? `${highestVolTVL.toFixed(2)}x` : 'N/A'}
            subValue={hasData ? highestVolTVLPair : 'No data'}
            icon="BoltIcon"
            variant="warning"
          />
          {/* Best fee opportunity */}
          <MetricCard
            label="Best Fee Opportunity"
            value={isLoading ? '…' : hasData ? bestFeePool : 'N/A'}
            subValue={hasData ? `Est. ${bestFeeAPR.toFixed(1)}% APR · Score ${bestFeeScore}` : 'No data'}
            icon="TrophyIcon"
            variant="positive"
          />
          {/* Most volatile */}
          <MetricCard
            label="Most Volatile Pool"
            value={isLoading ? '…' : hasData ? mostVolatilePair : 'N/A'}
            subValue={hasData ? `${mostVolatileChange >= 0 ? '+' : ''}${mostVolatileChange.toFixed(2)}% 24h` : 'No data'}
            icon="ExclamationTriangleIcon"
            variant="negative"
          />
          {/* Active alerts */}
          <MetricCard
            label="Active Alerts"
            value="N/A"
            subValue="Alert indexer required"
            icon="BellAlertIcon"
            variant="warning"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          {/* Volume trend chart */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">24h Volume & TVL Trend</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Historical data — requires indexer integration</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 rounded bg-primary inline-block" />
                  <span className="text-muted-foreground">Volume</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 rounded bg-accent inline-block" />
                  <span className="text-muted-foreground">TVL</span>
                </span>
              </div>
            </div>
            {error ? (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-destructive">Historical data unavailable</p>
              </div>
            ) : (
              <VolumeChart type="area" height={200} />
            )}
          </div>

          {/* Activity feed */}
          <div className="rounded-xl border border-border bg-card p-4 card-hover">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-foreground">Live Activity</h2>
              <div className="flex items-center gap-1.5">
                <div className="live-dot" />
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            </div>
            <ActivityFeed />
          </div>
        </div>

        {/* Top pools table */}
        <div className="rounded-xl border border-border bg-card card-hover overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-base font-semibold text-foreground">Top Pool Opportunities</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Analytics Score = 30% Vol/Active Liq · 20% Fee · 20% Consistency · 15% Time In Range · 10% Efficiency · 5% Risk
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/pool-scanner" className="btn-ghost text-xs">
                Full Scanner →
              </a>
            </div>
          </div>
          <TopPoolsTable />
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4">
          <p className="text-xs text-warning/80 leading-relaxed">
            <span className="font-semibold text-warning">⚠ Analytics Disclaimer:</span>{' '}
            All metrics, scores, and APR estimates are based on recent historical activity and are provided for informational purposes only.
            They do not constitute financial advice or guarantee future performance. Analytics Score is not a profit prediction.
            Always conduct your own research before providing liquidity. Impermanent loss risk exists in all LP positions.
          </p>
        </div>

        {/* Diagnostic panel — helps diagnose why /api/chain/pools returns empty */}
        <DiagnosticPanel />
      </div>
    </AppLayout>
  );
}