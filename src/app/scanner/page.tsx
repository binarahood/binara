'use client';

import React, { useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { LivePool, fmtUSD, fmtPct } from '@/lib/liveTypes';
import { getOpportunityScore } from '@/lib/opportunityScore';
import { usePoolsData } from '@/hooks/useChainData';

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs font-semibold text-muted-foreground">INSUFFICIENT DATA</span>;
  const tone = score >= 70 ? 'text-positive bg-positive-subtle border-positive/30' : score >= 45 ? 'text-warning bg-warning-subtle border-warning/30' : 'text-muted-foreground bg-muted/40 border-border';
  return <span className={`inline-flex px-2 py-1 rounded-md border text-xs font-bold font-mono-nums ${tone}`}>{score}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="data-label mb-0.5">{label}</p><p className="text-sm font-semibold font-mono-nums">{value}</p></div>;
}

export default function ScannerPage() {
  const { pools, isLoading, error, secondsAgo } = usePoolsData(30_000);
  const [search, setSearch] = useState('');
  const [minTVL, setMinTVL] = useState(0);
  const [minVolume, setMinVolume] = useState(0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pools
      .filter((p) => p.status === 'active')
      .filter((p) => (p.tvl ?? -1) >= minTVL && (p.volume24h ?? -1) >= minVolume)
      .filter((p) => !q || p.pair.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
      .map((pool) => ({ pool, score: getOpportunityScore(pool) }))
      .filter((row): row is { pool: LivePool; score: number } => row.score !== null)
      .sort((a, b) => b.score - a.score);
  }, [pools, search, minTVL, minVolume]);

  const top = rows[0] ?? null;
  const complete = rows.length;
  const activePools = pools.filter((p) => p.status === 'active').length;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h1 className="text-2xl font-bold text-foreground">Opportunity Scanner</h1><p className="text-sm text-muted-foreground mt-0.5">Live Robinhood Chain pool opportunities — verified inputs only</p></div>
          <div className="flex items-center gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pair or address" className="input-field h-9 w-56 text-sm" /><div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${error ? 'bg-destructive/10 border-destructive' : isLoading ? 'bg-muted/40 border-border' : 'bg-positive-subtle border-positive/30'}`}><span className={error ? 'w-2 h-2 rounded-full bg-destructive' : isLoading ? 'w-2 h-2 rounded-full bg-muted-foreground animate-pulse' : 'live-dot'} /><span className={`text-xs font-semibold ${error ? 'text-destructive' : isLoading ? 'text-muted-foreground' : 'text-positive'}`}>{error ? 'DATA ERROR' : isLoading ? 'LOADING' : `LIVE${secondsAgo !== null ? ` • ${secondsAgo}s` : ''}`}</span></div></div>
        </div>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"><p className="text-sm font-semibold text-destructive">Live data unavailable</p><p className="text-xs text-destructive/80 mt-1">{error}</p></div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div className="rounded-xl border border-border bg-card p-3"><p className="data-label">Active Pools</p><p className="text-xl font-bold font-mono-nums mt-1">{isLoading ? '…' : activePools}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="data-label">Complete Inputs</p><p className="text-xl font-bold font-mono-nums mt-1">{isLoading ? '…' : complete}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="data-label">Top Opportunity</p><p className="text-xl font-bold font-mono-nums mt-1">{top?.score ?? 'N/A'}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="data-label">Top Pair</p><p className="text-xl font-bold truncate mt-1">{top?.pool.pair ?? 'N/A'}</p></div></div>
        <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-4"><label className="text-xs text-muted-foreground">Minimum TVL<input type="number" min="0" value={minTVL} onChange={(e) => setMinTVL(Number(e.target.value) || 0)} className="input-field mt-1 h-9 w-40" /></label><label className="text-xs text-muted-foreground">Minimum 24h Volume<input type="number" min="0" value={minVolume} onChange={(e) => setMinVolume(Number(e.target.value) || 0)} className="input-field mt-1 h-9 w-40" /></label><button onClick={() => { setMinTVL(0); setMinVolume(0); setSearch(''); }} className="btn-ghost h-9">Reset</button></div>
        <div className="rounded-xl border border-border bg-card overflow-hidden"><div className="p-4 border-b border-border flex items-center justify-between"><div><h2 className="text-sm font-semibold">Ranked Live Opportunities</h2><p className="text-xs text-muted-foreground mt-0.5">Only pools with complete verified inputs are ranked; the score is a ranking aid, not a profit guarantee.</p></div><span className="text-xs text-muted-foreground">{rows.length} pools</span></div>{isLoading ? <div className="p-10 text-center text-sm text-muted-foreground">Fetching live opportunities…</div> : rows.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-semibold">No matching live pools</p><p className="text-xs text-muted-foreground mt-1">No dummy data is used.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left"><th className="px-4 py-3 data-label">Rank</th><th className="px-4 py-3 data-label">Pool</th><th className="px-4 py-3 data-label">Opportunity</th><th className="px-4 py-3 data-label">TVL</th><th className="px-4 py-3 data-label">24h Volume</th><th className="px-4 py-3 data-label">Vol/TVL</th><th className="px-4 py-3 data-label">Swaps</th><th className="px-4 py-3 data-label">Fee</th></tr></thead><tbody>{rows.map(({ pool, score }, i) => <tr key={pool.address} className="border-b border-border/60 hover:bg-muted/30"><td className="px-4 py-3 font-mono-nums text-muted-foreground">{i + 1}</td><td className="px-4 py-3"><p className="font-semibold">{pool.pair}</p><p className="text-[10px] font-mono text-muted-foreground">{pool.address}</p></td><td className="px-4 py-3"><ScoreBadge score={score} /></td><td className="px-4 py-3"><Metric label="" value={fmtUSD(pool.tvl)} /></td><td className="px-4 py-3"><Metric label="" value={fmtUSD(pool.volume24h)} /></td><td className="px-4 py-3 font-mono-nums">{pool.volumeToTVL === null ? 'N/A' : `${pool.volumeToTVL.toFixed(2)}x`}</td><td className="px-4 py-3 font-mono-nums">{pool.swapCount24h === null ? 'N/A' : pool.swapCount24h.toLocaleString()}</td><td className="px-4 py-3 font-mono-nums">{pool.fee === null ? 'N/A' : fmtPct(pool.fee)}</td></tr>)}</tbody></table></div>}</div>
        <div className="rounded-xl border border-info/20 bg-info-subtle p-3"><p className="text-xs text-info/80"><span className="font-semibold text-info">BINARA data policy:</span> no mock pools, invented risk scores, holder counts, LP lock claims, APR estimates, or profitability promises. A pool with missing verified inputs is excluded from ranking.</p></div>
      </div>
    </AppLayout>
  );
}
