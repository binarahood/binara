'use client';

import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import FilterSidebar, { FilterState } from './components/FilterSidebar';
import ScannerTable from './components/ScannerTable';
import Icon from '@/components/ui/AppIcon';
import { LivePool } from '@/lib/liveTypes';
import { usePoolsData } from '@/hooks/useChainData';

const DEFAULT_FILTERS: FilterState = {
  minTVL: 0,
  minVolume: 0,
  minVolToTVL: 0,
  minSwaps: 0,
};

export default function PoolScannerPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPool, setSelectedPool] = useState<LivePool | null>(null);
  const [search, setSearch] = useState('');
  const { pools, isLoading, error, secondsAgo } = usePoolsData(30_000);

  const filteredPools = useMemo(() => pools.filter((p) => {
    if (p.tvl !== null && p.tvl < filters.minTVL) return false;
    if (p.tvl === null && filters.minTVL > 0) return false;
    if (p.volume24h !== null && p.volume24h < filters.minVolume) return false;
    if (p.volume24h === null && filters.minVolume > 0) return false;
    if (p.volumeToTVL !== null && p.volumeToTVL < filters.minVolToTVL) return false;
    if (p.volumeToTVL === null && filters.minVolToTVL > 0) return false;
    if (p.swapCount24h !== null && p.swapCount24h < filters.minSwaps) return false;
    if (p.swapCount24h === null && filters.minSwaps > 0) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.pair.toLowerCase().includes(q) && !p.address.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [pools, filters, search]);

  const handleSelectPool = (pool: LivePool) => setSelectedPool(selectedPool?.id === pool.id ? null : pool);
  const scoredPools = filteredPools.filter((p) => p.analyticsScore !== null);
  const avgScore = scoredPools.length ? Math.round(scoredPools.reduce((a, b) => a + (b.analyticsScore ?? 0), 0) / scoredPools.length) : null;
  const ratios = filteredPools.map((p) => p.volumeToTVL).filter((v): v is number => v !== null && Number.isFinite(v));
  const highestVolTVL = ratios.length ? Math.max(...ratios) : null;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pool Scanner</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Live pool discovery — Robinhood Chain (ID 4663)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search pair or address" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-8 w-56 text-sm h-9" />
            </div>
            {isLoading ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border"><div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" /><span className="text-xs text-muted-foreground font-semibold">LOADING</span></div>
            ) : error ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive" title={error}><div className="w-2 h-2 rounded-full bg-destructive" /><span className="text-xs text-destructive font-semibold">DATA ERROR</span></div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30"><div className="live-dot" /><span className="text-xs text-positive font-semibold">LIVE{secondsAgo !== null ? ` • ${secondsAgo}s` : ''}</span></div>
            )}
          </div>
        </div>

        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3"><Icon name="ExclamationTriangleIcon" size={16} className="text-destructive flex-shrink-0 mt-0.5" /><div><p className="text-sm font-semibold text-destructive">Unable to retrieve live Robinhood Chain data.</p><p className="text-xs text-destructive/80 mt-0.5">{error}</p></div></div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Pools Discovered', isLoading ? '…' : pools.length ? pools.length.toString() : 'N/A', 'Live subgraph'],
            ['Matching Filters', isLoading ? '…' : filteredPools.length ? filteredPools.length.toString() : 'N/A', 'Current criteria'],
            ['Avg Score', avgScore === null ? 'N/A' : avgScore.toString(), scoredPools.length ? 'Only where live score exists' : 'Not calculated'],
            ['Highest Vol/TVL', highestVolTVL === null ? 'N/A' : `${highestVolTVL.toFixed(2)}x`, 'Live 24h data'],
          ].map(([label, value, sub]) => <div key={label} className="rounded-xl border border-border bg-card p-3 card-hover"><p className="data-label mb-1">{label}</p><p className="text-xl font-bold font-mono-nums text-foreground">{value}</p><p className="text-xs text-muted-foreground mt-0.5">{sub}</p></div>)}
        </div>

        <div className="flex gap-5 items-start">
          <FilterSidebar filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} />
          <div className="flex-1 min-w-0 space-y-4">
            {selectedPool && <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">{selectedPool.pair}</p><p className="text-xs text-muted-foreground font-mono break-all">{selectedPool.address}</p></div><button onClick={() => setSelectedPool(null)} className="btn-ghost"><Icon name="XMarkIcon" size={15} /></button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4"><Metric label="TVL" value={selectedPool.tvl} money /><Metric label="24h Volume" value={selectedPool.volume24h} money /><Metric label="Vol/TVL" value={selectedPool.volumeToTVL} suffix="x" /><Metric label="Swaps 24h" value={selectedPool.swapCount24h} /></div><p className="text-xs text-muted-foreground mt-3">No composite score is shown because the current live API does not provide enough verified inputs to calculate one without assumptions.</p></div>}

            <div className="rounded-xl border border-border bg-card overflow-hidden card-hover">
              <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-2">{!error && !isLoading && <div className="live-dot" />}<h2 className="text-sm font-semibold text-foreground">Live Pools</h2><span className="text-xs font-mono-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">{filteredPools.length} / {pools.length}</span></div><span className="text-xs text-muted-foreground">Refresh: 30s</span></div>
              {isLoading ? <div className="p-8 flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /><p className="text-sm text-muted-foreground">Fetching live pool data…</p></div> : error ? <div className="p-8 text-center"><Icon name="ExclamationTriangleIcon" size={32} className="text-destructive/50 mx-auto mb-2" /><p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p></div> : pools.length === 0 ? <div className="p-8 text-center"><Icon name="MagnifyingGlassIcon" size={32} className="text-muted-foreground/40 mx-auto mb-2" /><p className="text-sm font-semibold">No live pools returned</p><p className="text-xs text-muted-foreground mt-1">No placeholder data is used.</p></div> : <ScannerTable pools={filteredPools} onSelect={handleSelectPool} selectedId={selectedPool?.id} />}
            </div>

            <div className="rounded-xl border border-info/20 bg-info-subtle p-3"><p className="text-xs text-info/80"><span className="font-semibold text-info">Live-data policy:</span> N/A means the source does not currently provide a verified value. We do not substitute mock data, estimates, or hardcoded scores.</p></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Metric({ label, value, money = false, suffix = '' }: { label: string; value: number | null; money?: boolean; suffix?: string }) {
  const text = value === null || !Number.isFinite(value) ? 'N/A' : money ? (value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(2)}M` : value >= 1_000 ? `$${(value / 1_000).toFixed(1)}K` : `$${value.toFixed(2)}`) : `${value.toLocaleString()}${suffix}`;
  return <div className="rounded-lg bg-muted/30 border border-border p-2.5"><p className="data-label">{label}</p><p className="font-mono-nums font-semibold mt-1">{text}</p></div>;
}
