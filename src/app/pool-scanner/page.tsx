'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterSidebar, { FilterState } from './components/FilterSidebar';
import ScannerTable from './components/ScannerTable';
import ScoreBreakdownPanel from './components/ScoreBreakdownPanel';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import Icon from '@/components/ui/AppIcon';
import { usePoolsData } from '@/hooks/useChainData';

const DEFAULT_FILTERS: FilterState = { minTVL: 0, minVolume: 0, minVolToTVL: 0, maxVolatility: 25, feeTiers: [], riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'], minScore: 0, minSwaps: 0 };
interface SearchResult { address: string; pair?: string; tokenA?: string; tokenB?: string; tokenAName?: string | null; tokenBName?: string | null; tvl?: number | null; volume24h?: number | null; currentPrice?: number | null; discoverySource?: string; }

export default function PoolScannerPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPool, setSelectedPool] = useState<LivePool | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const { pools, isLoading, error, secondsAgo } = usePoolsData(30_000);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setSearchResults([]); setSearchMessage(''); setSearching(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setSearchMessage('');
      try {
        const response = await fetch(`/api/chain/pool-search?q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || 'Pool discovery failed');
        setSearchResults(Array.isArray(body.results) ? body.results : []);
        setSearchMessage(body.results?.length ? `Found ${body.results.length} matching pool${body.results.length === 1 ? '' : 's'}` : 'No verified pool match found yet');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') { setSearchResults([]); setSearchMessage('On-demand search unavailable'); }
      } finally { setSearching(false); }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search]);

  const filteredPools = useMemo(() => pools.filter((p) => {
    if ((p.tvl ?? 0) < filters.minTVL) return false;
    if ((p.volume24h ?? 0) < filters.minVolume) return false;
    if (filters.minVolToTVL > 0 && (p.volumeToTVL === null || p.volumeToTVL < filters.minVolToTVL)) return false;
    if (filters.maxVolatility < 100 && p.volatility !== null && p.volatility > filters.maxVolatility) return false;
    if (filters.feeTiers.length > 0 && !filters.feeTiers.includes(p.fee)) return false;
    if (p.riskLevel !== null && !filters.riskLevels.includes(p.riskLevel)) return false;
    if (filters.minScore > 0 && (p.analyticsScore === null || p.analyticsScore < filters.minScore)) return false;
    if (filters.minSwaps > 0 && (p.swapCount24h === null || p.swapCount24h < filters.minSwaps)) return false;
    return true;
  }), [pools, filters]);

  const handleSelectPool = (pool: LivePool) => setSelectedPool(selectedPool?.id === pool.id ? null : pool);
  const scoredPools = filteredPools.filter((p) => p.analyticsScore !== null);
  const avgScore = scoredPools.length ? Math.round(scoredPools.reduce((a, b) => a + b.analyticsScore!, 0) / scoredPools.length) : null;
  const volTVLPools = filteredPools.filter((p) => p.volumeToTVL !== null);
  const highestVolTVL = volTVLPools.length ? Math.max(...volTVLPools.map((p) => p.volumeToTVL!)) : null;

  return <AppLayout><div className="space-y-5 animate-fade-in">
    <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold text-foreground">Pool Scanner</h1><p className="text-sm text-muted-foreground mt-0.5">Live pool discovery — Robinhood Chain (ID 4663)</p></div><div className="flex items-center gap-2"><div className="relative"><Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="text" placeholder="Search pair, token or address" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-8 w-64 text-sm h-9" />{searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary border-t-transparent animate-spin" />}</div>{isLoading ? <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border"><div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" /><span className="text-xs text-muted-foreground font-semibold">LOADING</span></div> : error ? <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive"><div className="w-2 h-2 rounded-full bg-destructive" /><span className="text-xs text-destructive font-semibold">DATA CONNECTION ERROR</span></div> : <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30"><div className="live-dot" /><span className="text-xs text-positive font-semibold">LIVE{secondsAgo !== null ? ` • ${secondsAgo}s ago` : ''}</span></div>}</div></div>

    {search.trim().length >= 2 && <div className="rounded-xl border border-primary/20 bg-card overflow-hidden shadow-lg"><div className="flex items-center justify-between p-3 border-b border-border"><div><p className="text-xs font-semibold text-foreground">On-demand Pool Discovery</p><p className="text-[11px] text-muted-foreground">Pools hidden from the main scanner can be searched here.</p></div><span className="text-[11px] text-muted-foreground">{searchMessage}</span></div>{searchResults.length ? <div className="divide-y divide-border">{searchResults.map((result) => <Link key={result.address} href={`/pool-detail?address=${encodeURIComponent(result.address)}`} className="flex items-center justify-between gap-4 p-3 hover:bg-muted/30 transition-colors"><div className="min-w-0"><p className="text-sm font-semibold text-foreground truncate">{result.pair || `${result.tokenA || 'Unknown'}/${result.tokenB || 'Unknown'}`}</p><p className="text-[11px] text-muted-foreground truncate">{result.tokenAName || result.tokenA || 'Unknown'} / {result.tokenBName || result.tokenB || 'Unknown'} · {result.address.slice(0, 10)}…{result.address.slice(-6)}</p></div><div className="flex items-center gap-5 flex-shrink-0 text-right"><div><p className="data-label">TVL</p><p className="text-xs font-mono-nums text-foreground">{fmtUSD(result.tvl, '—')}</p></div><div className="hidden sm:block"><p className="data-label">24h Vol</p><p className="text-xs font-mono-nums text-foreground">{fmtUSD(result.volume24h, '—')}</p></div><Icon name="ChevronRightIcon" size={14} className="text-muted-foreground" /></div></Link>)}</div> : <div className="p-5 text-center"><p className="text-xs text-muted-foreground">{searchMessage || 'Searching verified sources…'}</p><p className="text-[11px] text-muted-foreground/70 mt-1">Try a token symbol, token name, or pool contract address.</p></div>}</div>}

    {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3"><Icon name="ExclamationTriangleIcon" size={16} className="text-destructive flex-shrink-0 mt-0.5" /><div><p className="text-sm font-semibold text-destructive">Unable to retrieve live Robinhood Chain data.</p><p className="text-xs text-destructive/80 mt-0.5">{error}</p></div></div>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[{ label: 'Pools Discovered', value: isLoading ? '…' : pools.length.toString(), sub: 'Verified liquidity pools' }, { label: 'Matching Filters', value: isLoading ? '…' : filteredPools.length.toString(), sub: 'Current criteria' }, { label: 'Avg Score', value: isLoading ? '…' : avgScore !== null ? avgScore.toString() : '—', sub: 'Verified inputs only' }, { label: 'Highest Vol/TVL', value: isLoading ? '…' : highestVolTVL !== null ? `${highestVolTVL.toFixed(1)}x` : '—', sub: 'Verified market data' }].map((stat) => <div key={stat.label} className="rounded-xl border border-border bg-card p-3 card-hover"><p className="data-label mb-1">{stat.label}</p><p className="text-xl font-bold font-mono-nums text-foreground">{stat.value}</p><p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p></div>)}</div>
    <div className="flex gap-5 items-start"><FilterSidebar filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} /><div className="flex-1 min-w-0 space-y-4">{selectedPool && <ScoreBreakdownPanel pool={selectedPool} onClose={() => setSelectedPool(null)} />}<div className="rounded-xl border border-border bg-card overflow-hidden card-hover"><div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-2">{!error && !isLoading && <div className="live-dot" />}<h2 className="text-sm font-semibold text-foreground">Active Pools</h2><span className="text-xs font-mono-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">{filteredPools.length} / {pools.length}</span></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon name="InformationCircleIcon" size={13} /><span>Only pools with usable liquidity are listed</span></div></div>{isLoading ? <div className="p-8 flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /><p className="text-sm text-muted-foreground">Fetching pools from Robinhood subgraph…</p></div> : error ? <div className="p-8 flex flex-col items-center gap-3"><Icon name="ExclamationTriangleIcon" size={32} className="text-destructive/50" /><p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p></div> : pools.length === 0 ? <div className="p-8 flex flex-col items-center gap-3"><Icon name="MagnifyingGlassIcon" size={32} className="text-muted-foreground/40" /><p className="text-sm font-semibold text-foreground">No active pools found</p><p className="text-xs text-muted-foreground text-center max-w-sm">Use the search above to discover pools on demand.</p></div> : <ScannerTable pools={filteredPools} onSelect={handleSelectPool} selectedId={selectedPool?.id} />}</div><div className="rounded-xl border border-info/20 bg-info-subtle p-3"><p className="text-xs text-info/80"><span className="font-semibold text-info">BINARA data policy:</span> the main scanner prioritizes pools with verified usable liquidity. Hidden/unresolved pools remain discoverable through on-demand search; no mock liquidity or fabricated market data is shown.</p></div></div></div>
  </div></AppLayout>;
}
