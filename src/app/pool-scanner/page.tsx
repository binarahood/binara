'use client';

import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import FilterSidebar, { FilterState } from './components/FilterSidebar';
import ScannerTable from './components/ScannerTable';
import ScoreBreakdownPanel from './components/ScoreBreakdownPanel';
import { LivePool } from '@/lib/liveTypes';
import Icon from '@/components/ui/AppIcon';
import { usePoolsData } from '@/hooks/useChainData';

const DEFAULT_FILTERS: FilterState = {
  minTVL: 0,
  minVolume: 0,
  minVolToTVL: 0,
  maxVolatility: 25,
  feeTiers: [0.05, 0.1, 0.3, 1.0],
  riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'],
  minScore: 0,
  minSwaps: 0,
};

export default function PoolScannerPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPool, setSelectedPool] = useState<LivePool | null>(null);
  const [search, setSearch] = useState('');

  const { pools, isLoading, error, secondsAgo, lastUpdated } = usePoolsData(30_000);

  const filteredPools = useMemo(() => {
    return pools.filter((p) => {
      if ((p.tvl ?? 0) < filters.minTVL) return false;
      if ((p.volume24h ?? 0) < filters.minVolume) return false;
      if (p.volumeToTVL < filters.minVolToTVL) return false;
      if (p.volatility > filters.maxVolatility) return false;
      if (!filters.feeTiers.includes(p.fee)) return false;
      if (!filters.riskLevels.includes(p.riskLevel)) return false;
      if (p.analyticsScore < filters.minScore) return false;
      if (p.swapCount24h < filters.minSwaps) return false;
      if (search && !p.pair.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [pools, filters, search]);

  const handleSelectPool = (pool: LivePool) => {
    setSelectedPool(selectedPool?.id === pool.id ? null : pool);
  };

  const avgScore = filteredPools.length
    ? Math.round(filteredPools.reduce((a, b) => a + b.analyticsScore, 0) / filteredPools.length)
    : null;
  const highestVolTVL = filteredPools.length
    ? Math.max(...filteredPools.map((p) => p.volumeToTVL))
    : null;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pool Scanner</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live pool discovery — Robinhood Chain (ID 4663)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search pair (e.g. ETH/USDC)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-8 w-56 text-sm h-9"
              />
            </div>
            {/* Live status indicator */}
            {isLoading ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                <span className="text-xs text-muted-foreground font-semibold">LOADING</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive" title={error}>
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-xs text-destructive font-semibold">DATA CONNECTION ERROR</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30">
                <div className="live-dot" />
                <span className="text-xs text-positive font-semibold">
                  LIVE{secondsAgo !== null ? ` • ${secondsAgo}s ago` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Unable to retrieve live Robinhood Chain data.</p>
              <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Pools Discovered',
              value: isLoading ? '…' : pools.length > 0 ? pools.length.toString() : 'N/A',
              sub: 'Robinhood Chain',
            },
            {
              label: 'Matching Filters',
              value: isLoading ? '…' : filteredPools.length > 0 ? filteredPools.length.toString() : 'N/A',
              sub: 'Current criteria',
            },
            {
              label: 'Avg Score',
              value: isLoading ? '…' : avgScore !== null ? avgScore.toString() : 'N/A',
              sub: 'Analytics score',
            },
            {
              label: 'Highest Vol/TVL',
              value: isLoading ? '…' : highestVolTVL !== null ? `${highestVolTVL.toFixed(1)}x` : 'N/A',
              sub: 'Best efficiency',
            },
          ].map((stat) => (
            <div key={`stat-${stat.label}`} className="rounded-xl border border-border bg-card p-3 card-hover">
              <p className="data-label mb-1">{stat.label}</p>
              <p className="text-xl font-bold font-mono-nums text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Main layout: filters + table */}
        <div className="flex gap-5 items-start">
          <FilterSidebar
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />

          <div className="flex-1 min-w-0 space-y-4">
            {/* Score breakdown panel */}
            {selectedPool && (
              <ScoreBreakdownPanel
                pool={selectedPool}
                onClose={() => setSelectedPool(null)}
              />
            )}

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden card-hover">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  {!error && !isLoading && <div className="live-dot" />}
                  <h2 className="text-sm font-semibold text-foreground">Discovered Pools</h2>
                  <span className="text-xs font-mono-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    {filteredPools.length} / {pools.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon name="InformationCircleIcon" size={13} />
                  <span>Click a row to view score breakdown</span>
                </div>
              </div>

              {isLoading ? (
                <div className="p-8 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm text-muted-foreground">Fetching live pool data from Robinhood Chain…</p>
                </div>
              ) : error ? (
                <div className="p-8 flex flex-col items-center gap-3">
                  <Icon name="ExclamationTriangleIcon" size={32} className="text-destructive/50" />
                  <p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p>
                  <p className="text-xs text-muted-foreground text-center max-w-sm">
                    Unable to retrieve live Robinhood Chain data. Pool indexer integration is required for pool discovery.
                  </p>
                </div>
              ) : pools.length === 0 ? (
                <div className="p-8 flex flex-col items-center gap-3">
                  <Icon name="MagnifyingGlassIcon" size={32} className="text-muted-foreground/40" />
                  <p className="text-sm font-semibold text-foreground">No pools found</p>
                  <p className="text-xs text-muted-foreground text-center max-w-sm">
                    Connected to Robinhood Chain. Pool indexer integration is required to discover and display live pools.
                  </p>
                </div>
              ) : (
                <ScannerTable
                  pools={filteredPools}
                  onSelect={handleSelectPool}
                  selectedId={selectedPool?.id}
                />
              )}
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl border border-warning/20 bg-warning-subtle p-3">
              <p className="text-xs text-warning/80">
                <span className="font-semibold text-warning">Analytics Disclaimer:</span>{' '}
                Analytics Score is a composite metric for informational purposes only. It is not a profit guarantee or investment advice.
                High Vol/TVL may indicate unsustainable volume spikes. Always verify on-chain data independently before providing liquidity.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}