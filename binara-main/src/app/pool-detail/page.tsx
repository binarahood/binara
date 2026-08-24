'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { RiskBadge, FeeBadge, StatusBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import dynamic from 'next/dynamic';
import FeeAnalytics from './components/FeeAnalytics';
import RiskPanel from './components/RiskPanel';
import ScenarioTable from './components/ScenarioTable';
import StrategySelector from './components/StrategySelector';
import { useSinglePoolStream } from '@/hooks/usePoolStream';
import { fmtUSD, fmtPrice } from '@/lib/liveTypes';

const PriceChart = dynamic(() => import('./components/PriceChart'), { ssr: false });
const LiquidityDistribution = dynamic(() => import('./components/LiquidityDistribution'), { ssr: false });

type TabId = 'overview' | 'liquidity' | 'simulate' | 'fees' | 'risk';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Price Chart', icon: 'PresentationChartLineIcon' },
  { id: 'liquidity', label: 'Liquidity', icon: 'ChartBarIcon' },
  { id: 'simulate', label: 'Simulator', icon: 'BeakerIcon' },
  { id: 'fees', label: 'Fee Analytics', icon: 'ReceiptPercentIcon' },
  { id: 'risk', label: 'Risk', icon: 'ExclamationTriangleIcon' },
];

export default function PoolDetailPage() {
  const { pool, isLoading, error, secondsAgo, streamStatus } = useSinglePoolStream();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [capital] = useState(10000);

  const [lowerRange, setLowerRange] = useState<number>(0);
  const [upperRange, setUpperRange] = useState<number>(0);

  useEffect(() => {
    if (pool && lowerRange === 0 && pool.currentPrice) {
      setLowerRange(pool.currentPrice * 0.95);
      setUpperRange(pool.currentPrice * 1.05);
    }
  }, [pool, lowerRange]);

  const handleStrategyChange = (_strategy: string, lower: number, upper: number) => {
    setLowerRange(lower);
    setUpperRange(upper);
  };

  const currentPrice = pool?.currentPrice ?? 0;
  const isInRange = pool && currentPrice > 0
    ? currentPrice >= lowerRange && currentPrice <= upperRange
    : false;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-lg font-bold text-primary z-10">
                {pool ? pool.tokenA[0] : '?'}
              </div>
              <div className="w-12 h-12 rounded-full bg-accent/20 border-2 border-card flex items-center justify-center text-lg font-bold text-accent">
                {pool ? pool.tokenB[0] : '?'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-foreground">
                  {isLoading ? 'Loading…' : pool ? pool.pair : 'N/A'}
                </h1>
                {pool && <FeeBadge fee={pool.fee} />}
                {pool && <RiskBadge level={pool.riskLevel} />}
                {pool && <StatusBadge status="active" />}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono-nums">
                <Icon name="CubeIcon" size={11} />
                <span>
                  {pool
                    ? `${pool.address.slice(0, 18)}...${pool.address.slice(-6)}`
                    : 'Pool address unavailable'}
                </span>
                {pool && (
                  <button suppressHydrationWarning className="hover:text-foreground transition-colors" title="Copy address">
                    <Icon name="DocumentDuplicateIcon" size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Live status — driven by WebSocket stream */}
            {isLoading ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                <span className="text-xs text-muted-foreground font-semibold">CONNECTING</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-xs text-destructive font-semibold">DATA CONNECTION ERROR</span>
              </div>
            ) : streamStatus.status === 'stale' ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <span className="text-xs text-warning font-semibold">STALE DATA</span>
              </div>
            ) : pools_length_check(streamStatus.poolsDiscovered) ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
                <div className="live-dot" />
                <span className="text-xs text-positive font-semibold">
                  LIVE{secondsAgo !== null ? ` • ${secondsAgo}s ago` : ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30">
                <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                <span className="text-xs text-warning font-semibold">INDEXING</span>
              </div>
            )}
            <button suppressHydrationWarning className="btn-ghost text-xs">
              <Icon name="BellIcon" size={14} />
              Set Alert
            </button>
            <button suppressHydrationWarning className="btn-secondary text-xs">
              <Icon name="ShareIcon" size={14} />
              Share
            </button>
            <button suppressHydrationWarning className="btn-primary text-xs">
              <Icon name="PlusCircleIcon" size={14} />
              Add Liquidity
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p>
              <p className="text-xs text-destructive/80 mt-0.5">Unable to retrieve live Robinhood Chain data. {error}</p>
            </div>
          </div>
        )}

        {/* No pool state */}
        {!isLoading && !error && !pool && (
          <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
            <Icon name="CircleStackIcon" size={32} className="text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">No pool data available</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              Connected to Robinhood Chain. Pool indexer integration is required to display live pool details.
            </p>
          </div>
        )}

        {/* Key metrics row */}
        {(isLoading || pool) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 gap-3">
            {[
              {
                id: 'km-price',
                label: 'Current Price',
                value: isLoading ? '…' : pool?.currentPrice ? fmtPrice(pool.currentPrice) : 'N/A',
                change: pool?.priceChange24h,
              },
              { id: 'km-tvl', label: 'TVL', value: isLoading ? '…' : fmtUSD(pool?.tvl), note: 'Total locked' },
              { id: 'km-vol24', label: '24h Volume', value: isLoading ? '…' : fmtUSD(pool?.volume24h), note: 'Swap volume' },
              {
                id: 'km-voltvl',
                label: 'Vol/TVL',
                value: isLoading ? '…' : pool ? `${pool.volumeToTVL.toFixed(2)}x` : 'N/A',
                note: 'Efficiency ratio',
                highlight: pool ? pool.volumeToTVL > 3 : false,
              },
              {
                id: 'km-activebin',
                label: 'Active Bin',
                value: isLoading ? '…' : pool?.activeBin != null ? pool.activeBin.toString() : 'N/A',
                note: 'Current bin ID',
              },
              {
                id: 'km-apr',
                label: 'Est. APR*',
                value: isLoading ? '…' : pool?.estimatedAPR != null ? `${pool.estimatedAPR.toFixed(1)}%` : 'N/A',
                note: 'Based on recent data',
                highlight: pool ? (pool.estimatedAPR ?? 0) > 0 : false,
              },
            ].map((m) => (
              <div key={m.id} className={`rounded-xl border p-3 card-hover transition-all duration-500 ${
                m.highlight ? 'border-positive/30 bg-positive-subtle' : 'border-border bg-card'
              }`}>
                <p className="data-label mb-1">{m.label}</p>
                <p className={`text-base font-bold font-mono-nums ${m.highlight ? 'text-positive' : 'text-foreground'}`}>
                  {m.value}
                </p>
                {m.change !== undefined && m.change !== null && (
                  <p className={`text-xs font-mono-nums mt-0.5 ${m.change >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}% 24h
                  </p>
                )}
                {m.note && m.change === undefined && (
                  <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Secondary metrics */}
        {(isLoading || pool) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'sm-binstep', label: 'Bin Step', value: isLoading ? '…' : pool ? pool.binStep.toString() : 'N/A', note: 'Price granularity' },
              { id: 'sm-swaps', label: 'Swaps 24h', value: isLoading ? '…' : pool ? pool.swapCount24h.toLocaleString() : 'N/A', note: 'Transaction count' },
              { id: 'sm-timeinrange', label: 'Time In Range', value: isLoading ? '…' : pool?.timeInRange != null ? `${pool.timeInRange.toFixed(1)}%` : 'N/A', note: 'Historical avg' },
              { id: 'sm-volatility', label: 'Volatility 24h', value: isLoading ? '…' : pool ? `${pool.volatility.toFixed(1)}%` : 'N/A', note: 'Price std dev' },
            ].map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-3 card-hover transition-all duration-500">
                <p className="data-label mb-1">{m.label}</p>
                <p className="text-lg font-bold font-mono-nums text-foreground">{m.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.note}</p>
              </div>
            ))}
          </div>
        )}

        {/* Main content: tabs + sidebar — only show when pool data available */}
        {pool && (
          <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-5">
            {/* Left: tabbed charts */}
            <div className="xl:col-span-2 space-y-4">
              <div className="flex items-center gap-1 border-b border-border">
                {TABS.map((tab) => (
                  <button
                    suppressHydrationWarning
                    key={`tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 -mb-px ${
                      activeTab === tab.id
                        ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    }`}
                  >
                    <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={14} />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 card-hover">
                {activeTab === 'overview' && (
                  <div className="animate-fade-in">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-foreground">{pool.pair} Price</h2>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono-nums">LP Range: {fmtPrice(lowerRange)} — {fmtPrice(upperRange)}</span>
                      </div>
                    </div>
                    <PriceChart
                      currentPrice={pool.currentPrice ?? 0}
                      lowerRange={lowerRange}
                      upperRange={upperRange}
                    />
                  </div>
                )}
                {activeTab === 'liquidity' && (
                  <div className="animate-fade-in">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-foreground">DLMM Liquidity Distribution</h2>
                      <span className="text-xs text-muted-foreground font-mono-nums">
                        Bin step: {pool.binStep}
                        {pool.activeBin != null ? ` · Active bin: ${pool.activeBin}` : ''}
                      </span>
                    </div>
                    <LiquidityDistribution
                      lowerRange={lowerRange}
                      upperRange={upperRange}
                      poolAddress={pool.address}
                      activeBin={pool.activeBin}
                      binStep={pool.binStep}
                    />
                  </div>
                )}
                {activeTab === 'simulate' && (
                  <div className="animate-fade-in space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-foreground">Range Simulator</h2>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning-subtle text-warning border border-warning/30">
                        SIMULATION
                      </span>
                    </div>
                    <ScenarioTable
                      initialCapital={capital}
                      currentPrice={pool.currentPrice ?? 0}
                      lowerPrice={lowerRange}
                      upperPrice={upperRange}
                      feeEstimate={(pool.volume24h ?? 0) * (pool.fee / 100) * (capital / Math.max(pool.tvl ?? 1, 1))}
                    />
                  </div>
                )}
                {activeTab === 'fees' && (
                  <div className="animate-fade-in">
                    <h2 className="text-sm font-semibold text-foreground mb-3">Fee Analytics</h2>
                    <FeeAnalytics
                      estimatedAPR={pool.estimatedAPR ?? null}
                      volume24h={pool.volume24h ?? null}
                      fee={pool.fee}
                      tvl={pool.tvl ?? null}
                      activeLiquidity={null}
                    />
                  </div>
                )}
                {activeTab === 'risk' && (
                  <div className="animate-fade-in">
                    <h2 className="text-sm font-semibold text-foreground mb-3">Risk Assessment</h2>
                    <RiskPanel pool={pool} />
                  </div>
                )}
              </div>
            </div>

            {/* Right: strategy selector */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 card-hover">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Strategy Simulator</h2>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning-subtle text-warning border border-warning/30">
                    SIMULATION
                  </span>
                </div>
                <StrategySelector
                  currentPrice={pool.currentPrice ?? 0}
                  onStrategyChange={handleStrategyChange}
                />
              </div>

              {/* Rebalance assistant */}
              <div className="rounded-xl border border-border bg-card p-4 card-hover">
                <h2 className="text-sm font-semibold text-foreground mb-3">Rebalance Assistant</h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
                    <span className="text-xs text-muted-foreground">Distance to lower</span>
                    <span className="text-xs font-mono-nums text-positive font-semibold">
                      {lowerRange > 0 && currentPrice > 0 ? `${(((currentPrice - lowerRange) / currentPrice) * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
                    <span className="text-xs text-muted-foreground">Distance to upper</span>
                    <span className="text-xs font-mono-nums text-positive font-semibold">
                      {upperRange > 0 && currentPrice > 0 ? `${(((upperRange - currentPrice) / currentPrice) * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
                    <span className="text-xs text-muted-foreground">Position status</span>
                    <StatusBadge status={isInRange ? 'in-range' : 'out-of-range'} />
                  </div>
                </div>
                <div className={`mt-3 p-3 rounded-xl border ${
                  isInRange
                    ? 'bg-positive-subtle border-positive/20' : 'bg-negative-subtle border-negative/20'
                }`}>
                  <div className="flex items-start gap-2">
                    <Icon
                      name={isInRange ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'}
                      size={14}
                      className={`${isInRange ? 'text-positive' : 'text-negative'} flex-shrink-0 mt-0.5`}
                    />
                    <p className={`text-xs ${isInRange ? 'text-positive/90' : 'text-negative/90'}`}>
                      {isInRange
                        ? 'Position is healthy. No rebalance recommended at this time.' :'Price is outside your LP range. Position is not earning fees. Consider rebalancing.'}
                    </p>
                  </div>
                </div>
                <button
                  suppressHydrationWarning
                  disabled
                  className="btn-secondary w-full mt-3 text-xs opacity-60 cursor-not-allowed"
                  title="Connect wallet to execute rebalance"
                >
                  <Icon name="WalletIcon" size={13} />
                  Connect Wallet to Rebalance
                </button>
              </div>

              {/* Volume breakdown */}
              <div className="rounded-xl border border-border bg-card p-4 card-hover">
                <h2 className="text-sm font-semibold text-foreground mb-3">Volume Breakdown</h2>
                <div className="space-y-2">
                  {[
                    { id: 'vb-1h', label: '1h Volume', value: fmtUSD(pool.volume1h) },
                    { id: 'vb-6h', label: '6h Volume', value: fmtUSD(pool.volume6h) },
                    { id: 'vb-24h', label: '24h Volume', value: fmtUSD(pool.volume24h) },
                    { id: 'vb-voltvl', label: 'Vol/TVL (24h)', value: `${pool.volumeToTVL.toFixed(2)}x` },
                    { id: 'vb-protocol', label: 'Protocol', value: pool.protocol },
                    { id: 'vb-binstep', label: 'Bin Step', value: pool.binStep.toString() },
                  ].map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-mono-nums font-semibold text-foreground">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer disclaimer */}
        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4">
          <p className="text-xs text-warning/80 leading-relaxed">
            <span className="font-semibold text-warning">⚠ Analytics Disclaimer:</span>{' '}
            All metrics, APR estimates, and simulation results are for informational purposes only.
            They do not constitute financial advice. Providing liquidity involves risk including impermanent loss and smart contract risk.
            Always verify data independently before transacting. * APR estimates based on recent 24h data. Not guaranteed.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

// Helper to check if we have real indexed data
function pools_length_check(count: number): boolean {
  return count > 0;
}