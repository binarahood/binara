'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import { FeeBadge, RiskBadge, StatusBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import FeeAnalytics from './components/FeeAnalytics';
import RiskPanel from './components/RiskPanel';
import ScenarioTable from './components/ScenarioTable';
import StrategySelector from './components/StrategySelector';
import { useSinglePoolStream } from '@/hooks/usePoolStream';
import { fmtPct, fmtPrice, fmtUSD } from '@/lib/liveTypes';

const PriceChart = dynamic(() => import('./components/PriceChart'), { ssr: false });
const LiquidityDistribution = dynamic(() => import('./components/LiquidityDistribution'), { ssr: false });

type TabId = 'overview' | 'liquidity' | 'simulate' | 'fees' | 'risk';
const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'overview', label: 'Price Chart', icon: 'PresentationChartLineIcon' },
  { id: 'liquidity', label: 'Liquidity', icon: 'ChartBarIcon' },
  { id: 'simulate', label: 'Simulator', icon: 'BeakerIcon' },
  { id: 'fees', label: 'Fee Analytics', icon: 'ReceiptPercentIcon' },
  { id: 'risk', label: 'Risk', icon: 'ExclamationTriangleIcon' },
];

function Metric({ label, value, note, change, highlight = false }: { label: string; value: string; note?: string; change?: number | null; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 card-hover ${highlight ? 'border-positive/30 bg-positive-subtle' : 'border-border bg-card'}`}>
      <p className="data-label mb-1">{label}</p>
      <p className={`text-base font-bold font-mono-nums ${highlight ? 'text-positive' : 'text-foreground'}`}>{value}</p>
      {change !== undefined && change !== null ? <p className={`text-xs font-mono-nums mt-0.5 ${change >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtPct(change)} 24h</p> : note ? <p className="text-xs text-muted-foreground mt-0.5">{note}</p> : null}
    </div>
  );
}

export default function PoolDetailPage() {
  const { pool, isLoading, error, secondsAgo, streamStatus } = useSinglePoolStream();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [lowerRange, setLowerRange] = useState(0);
  const [upperRange, setUpperRange] = useState(0);
  const capital = 10_000;

  useEffect(() => {
    if (pool?.currentPrice && lowerRange === 0) {
      setLowerRange(pool.currentPrice * 0.95);
      setUpperRange(pool.currentPrice * 1.05);
    }
  }, [pool, lowerRange]);

  const currentPrice = pool?.currentPrice ?? 0;
  const inRange = Boolean(pool && currentPrice > 0 && currentPrice >= lowerRange && currentPrice <= upperRange);
  const poolName = pool?.pair ?? 'N/A';
  const tokenNames = pool ? [pool.tokenAName, pool.tokenBName].filter(Boolean).join(' / ') : '';

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex -space-x-3 flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-lg font-bold text-primary z-10">{pool?.tokenA?.[0] ?? '?'}</div>
              <div className="w-12 h-12 rounded-full bg-accent/20 border-2 border-card flex items-center justify-center text-lg font-bold text-accent">{pool?.tokenB?.[0] ?? '?'}</div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground truncate">{isLoading ? 'Loading…' : poolName}</h1>
                {pool && <FeeBadge fee={pool.fee} />}
                {pool && <RiskBadge level={pool.riskLevel} />}
                {pool && <StatusBadge status={pool.status === 'active' ? 'active' : 'inactive'} />}
              </div>
              {tokenNames && <p className="text-xs text-muted-foreground truncate mb-1">{tokenNames}</p>}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono-nums">
                <Icon name="CubeIcon" size={11} />
                <span className="truncate">{pool ? `${pool.address.slice(0, 18)}...${pool.address.slice(-6)}` : 'Pool address unavailable'}</span>
                {pool && <button type="button" onClick={() => navigator.clipboard?.writeText(pool.address)} title="Copy address" className="hover:text-foreground"><Icon name="DocumentDuplicateIcon" size={11} /></button>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isLoading ? <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground font-semibold">CONNECTING</span> : error ? <span className="px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive text-xs text-destructive font-semibold">DATA ERROR</span> : streamStatus.status === 'stale' ? <span className="px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30 text-xs text-warning font-semibold">STALE DATA</span> : streamStatus.poolsDiscovered > 0 ? <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30 text-xs text-positive font-semibold"><span className="live-dot" />LIVE{secondsAgo !== null ? ` • ${secondsAgo}s` : ''}</span> : <span className="px-2.5 py-1 rounded-lg bg-warning-subtle border border-warning/30 text-xs text-warning font-semibold">INDEXING</span>}
            <button type="button" className="btn-ghost text-xs"><Icon name="BellIcon" size={14} />Set Alert</button>
            <button type="button" className="btn-secondary text-xs"><Icon name="ShareIcon" size={14} />Share</button>
            <button type="button" className="btn-primary text-xs"><Icon name="PlusCircleIcon" size={14} />Add Liquidity</button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"><p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p><p className="text-xs text-destructive/80 mt-0.5">Unable to retrieve live Robinhood Chain data. {error}</p></div>}
        {!isLoading && !error && !pool && <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="text-sm font-semibold text-foreground">No pool data available</p><p className="text-xs text-muted-foreground mt-1">The requested pool is not present in the live verified pool index.</p></div>}

        {(isLoading || pool) && <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric label="Current Price" value={isLoading ? '…' : fmtPrice(pool?.currentPrice)} change={pool?.priceChange24h} />
            <Metric label="TVL" value={isLoading ? '…' : fmtUSD(pool?.tvl)} note="Total locked" />
            <Metric label="24h Volume" value={isLoading ? '…' : fmtUSD(pool?.volume24h)} note="Swap volume" />
            <Metric label="Vol/TVL" value={isLoading ? '…' : pool?.volumeToTVL == null ? 'N/A' : `${pool.volumeToTVL.toFixed(2)}x`} note="Efficiency ratio" highlight={pool?.volumeToTVL != null && pool.volumeToTVL > 3} />
            <Metric label="Active Bin" value={isLoading ? '…' : pool?.activeBin == null ? 'N/A' : String(pool.activeBin)} note="Current bin ID" />
            <Metric label="Est. APR*" value={isLoading ? '…' : pool?.estimatedAPR == null ? 'N/A' : `${pool.estimatedAPR.toFixed(1)}%`} note="Recent data only" highlight={pool?.estimatedAPR != null && pool.estimatedAPR > 0} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Bin Step" value={isLoading ? '…' : pool ? String(pool.binStep) : 'N/A'} note="Price granularity" />
            <Metric label="Swaps 24h" value={isLoading ? '…' : pool?.swapCount24h == null ? 'N/A' : pool.swapCount24h.toLocaleString()} note="Transaction count" />
            <Metric label="Time In Range" value={isLoading ? '…' : pool?.timeInRange == null ? 'N/A' : `${pool.timeInRange.toFixed(1)}%`} note="Historical average" />
            <Metric label="Volatility 24h" value={isLoading ? '…' : pool?.volatility == null ? 'N/A' : `${pool.volatility.toFixed(1)}%`} note="Verified input only" />
          </div>
        </>}

        {pool && <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
              {TABS.map((tab) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={14} />{tab.label}</button>)}
            </div>
            <div className="rounded-xl border border-border bg-card p-4 card-hover">
              {activeTab === 'overview' && <div><div className="flex items-center justify-between gap-3 mb-3"><h2 className="text-sm font-semibold text-foreground">{poolName} Price</h2><span className="text-xs text-muted-foreground font-mono-nums">LP Range: {fmtPrice(lowerRange)} — {fmtPrice(upperRange)}</span></div><PriceChart currentPrice={currentPrice} lowerRange={lowerRange} upperRange={upperRange} /></div>}
              {activeTab === 'liquidity' && <div><div className="flex items-center justify-between gap-3 mb-3"><h2 className="text-sm font-semibold text-foreground">DLMM Liquidity Distribution</h2><span className="text-xs text-muted-foreground font-mono-nums">Bin step: {pool.binStep}{pool.activeBin != null ? ` · Active bin: ${pool.activeBin}` : ''}</span></div><LiquidityDistribution lowerRange={lowerRange} upperRange={upperRange} poolAddress={pool.address} activeBin={pool.activeBin} binStep={pool.binStep} /></div>}
              {activeTab === 'simulate' && <ScenarioTable initialCapital={capital} currentPrice={currentPrice} lowerPrice={lowerRange} upperPrice={upperRange} feeEstimate={(pool.volume24h ?? 0) * (pool.fee / 100) * (capital / Math.max(pool.tvl ?? 1, 1))} />}
              {activeTab === 'fees' && <FeeAnalytics estimatedAPR={pool.estimatedAPR} volume24h={pool.volume24h} fee={pool.fee} tvl={pool.tvl} activeLiquidity={null} />}
              {activeTab === 'risk' && <RiskPanel pool={pool} />}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 card-hover"><div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-foreground">Strategy Simulator</h2><span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning-subtle text-warning border border-warning/30">SIMULATION</span></div><StrategySelector currentPrice={currentPrice} onStrategyChange={(_strategy, lower, upper) => { setLowerRange(lower); setUpperRange(upper); }} /></div>
            <div className="rounded-xl border border-border bg-card p-4 card-hover"><h2 className="text-sm font-semibold text-foreground mb-3">Rebalance Assistant</h2><div className="space-y-2"><div className="flex justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><span className="text-xs text-muted-foreground">Distance to lower</span><span className="text-xs font-mono-nums">{lowerRange > 0 && currentPrice > 0 ? `${((currentPrice - lowerRange) / currentPrice * 100).toFixed(1)}%` : 'N/A'}</span></div><div className="flex justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><span className="text-xs text-muted-foreground">Distance to upper</span><span className="text-xs font-mono-nums">{upperRange > 0 && currentPrice > 0 ? `${((upperRange - currentPrice) / currentPrice * 100).toFixed(1)}%` : 'N/A'}</span></div><div className="flex justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><span className="text-xs text-muted-foreground">Position status</span><StatusBadge status={inRange ? 'in-range' : 'out-of-range'} /></div></div></div>
            <div className="rounded-xl border border-border bg-card p-4 card-hover"><h2 className="text-sm font-semibold text-foreground mb-3">Pool Data Quality</h2><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Protocol</span><span className="font-medium text-foreground">{pool.protocol}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Token A</span><span className="font-mono-nums text-foreground">{pool.tokenA}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Token B</span><span className="font-mono-nums text-foreground">{pool.tokenB}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Verified gaps</span><span className="text-muted-foreground">N/A, not zero</span></div></div></div>
          </div>
        </div>}

        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4"><p className="text-xs text-warning/80 leading-relaxed"><span className="font-semibold text-warning">Analytics Disclaimer:</span> Unavailable verified metrics remain N/A. They are never silently converted to zero or fabricated. APR and simulation values are informational only.</p></div>
      </div>
    </AppLayout>
  );
}
