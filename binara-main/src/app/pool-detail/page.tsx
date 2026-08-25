'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { RiskBadge, FeeBadge, StatusBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import dynamic from 'next/dynamic';
import FeeAnalytics from './components/FeeAnalytics';
import RiskPanel from './components/RiskPanel';
import ScenarioTable from './components/ScenarioTable';
import StrategySelector from './components/StrategySelector';
import { useSinglePoolStream } from '@/hooks/usePoolStream';
import { LivePool, fmtUSD, fmtPrice } from '@/lib/liveTypes';

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

function normalizePool(pool: LivePool): LivePool {
  return {
    ...pool,
    tokenA: pool.tokenA ?? '',
    tokenB: pool.tokenB ?? '',
    binStep: pool.binStep ?? 5,
    activeBin: pool.activeBin ?? null,
    fee: pool.fee ?? 0,
    tvl: pool.tvl ?? 0,
    volume1h: pool.volume1h ?? 0,
    volume6h: pool.volume6h ?? 0,
    volume24h: pool.volume24h ?? 0,
    volumeToTVL: Number.isFinite(pool.volumeToTVL ?? NaN) ? pool.volumeToTVL : 0,
    volatility: Number.isFinite(pool.volatility ?? NaN) ? pool.volatility : 0,
    analyticsScore: pool.analyticsScore ?? 0,
    riskLevel: pool.riskLevel ?? 'HIGH',
    estimatedAPR: pool.estimatedAPR ?? 0,
    timeInRange: pool.timeInRange ?? 0,
    swapCount24h: pool.swapCount24h ?? 0,
    swapCount1h: pool.swapCount1h ?? 0,
  };
}

export default function PoolDetailPage() {
  const { pool: rawPool, isLoading, error, secondsAgo, streamStatus } = useSinglePoolStream();
  const pool = useMemo(() => (rawPool ? normalizePool(rawPool) : null), [rawPool]);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [lowerRange, setLowerRange] = useState(0);
  const [upperRange, setUpperRange] = useState(0);

  useEffect(() => {
    const price = pool?.currentPrice ?? 0;
    if (price > 0 && lowerRange === 0) {
      setLowerRange(price * 0.95);
      setUpperRange(price * 1.05);
    }
  }, [pool, lowerRange]);

  const currentPrice = pool?.currentPrice ?? 0;
  const isInRange = currentPrice > 0 && lowerRange > 0 && upperRange > 0
    ? currentPrice >= lowerRange && currentPrice <= upperRange
    : false;

  const handleStrategyChange = (_strategy: string, lower: number, upper: number) => {
    setLowerRange(lower);
    setUpperRange(upper);
  };

  const hasRealPoolData = streamStatus.hasRealPoolData || !!pool;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-lg font-bold text-primary z-10">
                {pool?.tokenA?.[0] || '?'}
              </div>
              <div className="w-12 h-12 rounded-full bg-accent/20 border-2 border-card flex items-center justify-center text-lg font-bold text-accent">
                {pool?.tokenB?.[0] || '?'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-foreground">
                  {isLoading ? 'Loading…' : pool?.pair || 'N/A'}
                </h1>
                {pool && <FeeBadge fee={pool.fee} />}
                {pool && <RiskBadge level={pool.riskLevel} />}
                {pool && <StatusBadge status={pool.status || 'active'} />}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono-nums">
                <Icon name="CubeIcon" size={11} />
                <span>{pool ? `${pool.address.slice(0, 18)}...${pool.address.slice(-6)}` : 'Pool address unavailable'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
            ) : hasRealPoolData ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
                <div className="live-dot" />
                <span className="text-xs text-positive font-semibold">LIVE{secondsAgo !== null ? ` • ${secondsAgo}s ago` : ''}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30">
                <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                <span className="text-xs text-warning font-semibold">INDEXING</span>
              </div>
            )}
            <button suppressHydrationWarning className="btn-ghost text-xs"><Icon name="BellIcon" size={14} />Set Alert</button>
            <button suppressHydrationWarning className="btn-secondary text-xs"><Icon name="ShareIcon" size={14} />Share</button>
            <button suppressHydrationWarning className="btn-primary text-xs"><Icon name="PlusCircleIcon" size={14} />Add Liquidity</button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p>
              <p className="text-xs text-destructive/80 mt-0.5">Unable to retrieve live Robinhood Chain data. {error}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && !pool && (
          <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
            <Icon name="CircleStackIcon" size={32} className="text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">No pool data available</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">Connected to Robinhood Chain. Pool indexer integration is required to display live pool details.</p>
          </div>
        )}

        {pool && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                ['Current Price', currentPrice > 0 ? fmtPrice(currentPrice) : 'N/A'],
                ['TVL', fmtUSD(pool.tvl)],
                ['24h Volume', fmtUSD(pool.volume24h)],
                ['Vol/TVL', `${pool.volumeToTVL.toFixed(2)}x`],
                ['Active Bin', pool.activeBin != null ? pool.activeBin.toString() : 'N/A'],
                ['Est. APR*', `${pool.estimatedAPR.toFixed(1)}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-card p-3 card-hover">
                  <p className="data-label mb-1">{label}</p>
                  <p className="text-base font-bold font-mono-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Bin Step', pool.binStep.toString()],
                ['Swaps 24h', pool.swapCount24h.toLocaleString()],
                ['Time In Range', `${pool.timeInRange.toFixed(1)}%`],
                ['Volatility 24h', `${pool.volatility.toFixed(1)}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-card p-3 card-hover">
                  <p className="data-label mb-1">{label}</p>
                  <p className="text-lg font-bold font-mono-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2 space-y-4">
                <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
                  {TABS.map((tab) => (
                    <button
                      suppressHydrationWarning
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}`}
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
                        <span className="text-xs text-muted-foreground font-mono-nums">LP Range: {fmtPrice(lowerRange)} — {fmtPrice(upperRange)}</span>
                      </div>
                      <PriceChart currentPrice={currentPrice} lowerRange={lowerRange} upperRange={upperRange} />
                    </div>
                  )}
                  {activeTab === 'liquidity' && (
                    <div className="animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-foreground">DLMM Liquidity Distribution</h2>
                        <span className="text-xs text-muted-foreground font-mono-nums">Bin step: {pool.binStep}{pool.activeBin != null ? ` · Active bin: ${pool.activeBin}` : ''}</span>
                      </div>
                      <LiquidityDistribution lowerRange={lowerRange} upperRange={upperRange} poolAddress={pool.address} activeBin={pool.activeBin} binStep={pool.binStep} />
                    </div>
                  )}
                  {activeTab === 'simulate' && (
                    <div className="animate-fade-in space-y-4">
                      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">Range Simulator</h2><span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning-subtle text-warning border border-warning/30">SIMULATION</span></div>
                      <ScenarioTable initialCapital={10000} currentPrice={currentPrice} lowerPrice={lowerRange} upperPrice={upperRange} feeEstimate={(pool.volume24h * (pool.fee / 100) * (10000 / Math.max(pool.tvl, 1)))} />
                    </div>
                  )}
                  {activeTab === 'fees' && (
                    <div className="animate-fade-in">
                      <h2 className="text-sm font-semibold text-foreground mb-3">Fee Analytics</h2>
                      <FeeAnalytics estimatedAPR={pool.estimatedAPR} volume24h={pool.volume24h} fee={pool.fee} tvl={pool.tvl} activeLiquidity={null} />
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

              <div className="space-y-4">
                {currentPrice > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4 card-hover">
                    <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-foreground">Strategy Simulator</h2><span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning-subtle text-warning border border-warning/30">SIMULATION</span></div>
                    <StrategySelector currentPrice={currentPrice} onStrategyChange={handleStrategyChange} />
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card p-4 card-hover">
                  <h2 className="text-sm font-semibold text-foreground mb-3">Rebalance Assistant</h2>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><span className="text-xs text-muted-foreground">Distance to lower</span><span className="text-xs font-mono-nums text-positive font-semibold">{lowerRange > 0 && currentPrice > 0 ? `${(((currentPrice - lowerRange) / currentPrice) * 100).toFixed(1)}%` : 'N/A'}</span></div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><span className="text-xs text-muted-foreground">Distance to upper</span><span className="text-xs font-mono-nums text-positive font-semibold">{upperRange > 0 && currentPrice > 0 ? `${(((upperRange - currentPrice) / currentPrice) * 100).toFixed(1)}%` : 'N/A'}</span></div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><span className="text-xs text-muted-foreground">Position status</span><StatusBadge status={isInRange ? 'in-range' : 'out-of-range'} /></div>
                  </div>
                  <div className={`mt-3 p-3 rounded-xl border ${isInRange ? 'bg-positive-subtle border-positive/20' : 'bg-negative-subtle border-negative/20'}`}>
                    <div className="flex items-start gap-2"><Icon name={isInRange ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'} size={14} className={isInRange ? 'text-positive flex-shrink-0 mt-0.5' : 'text-negative flex-shrink-0 mt-0.5'} /><p className={`text-xs ${isInRange ? 'text-positive/90' : 'text-negative/90'}`}>{isInRange ? 'Position is healthy. No rebalance recommended at this time.' : 'Price is outside your LP range. Position is not earning fees. Consider rebalancing.'}</p></div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 card-hover">
                  <h2 className="text-sm font-semibold text-foreground mb-3">Volume Breakdown</h2>
                  <div className="space-y-2">
                    {[
                      ['1h Volume', fmtUSD(pool.volume1h)],
                      ['6h Volume', fmtUSD(pool.volume6h)],
                      ['24h Volume', fmtUSD(pool.volume24h)],
                      ['Vol/TVL (24h)', `${pool.volumeToTVL.toFixed(2)}x`],
                      ['Protocol', pool.protocol || 'Unknown'],
                      ['Bin Step', pool.binStep.toString()],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="text-xs font-mono-nums font-semibold text-foreground">{value}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4">
          <p className="text-xs text-warning/80 leading-relaxed"><span className="font-semibold text-warning">⚠ Analytics Disclaimer:</span>{' '}All metrics, APR estimates, and simulation results are for informational purposes only. They do not constitute financial advice. Providing liquidity involves risk including impermanent loss and smart contract risk. Always verify data independently before transacting. * APR estimates based on recent 24h data. Not guaranteed.</p>
        </div>
      </div>
    </AppLayout>
  );
}
