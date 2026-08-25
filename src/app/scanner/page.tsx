'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { usePoolsData } from '@/hooks/useChainData';
import { LivePool, fmtUSD, fmtPct } from '@/lib/liveTypes';

// Scanner V1 intentionally uses only fields exposed by the verified live pool API.
// No synthetic holders, LP-lock status, 5m volume, or token-age fallbacks.
type SortKey = 'volume1h' | 'volume6h' | 'volume24h' | 'volumeToTVL' | 'swapCount1h' | 'swapCount24h' | 'analyticsScore' | 'riskLevel';

const RISK_ORDER: Record<LivePool['riskLevel'], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EXTREME: 3,
};

function ageLabel(createdAt: string | null) {
  if (!createdAt) return 'N/A';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function riskClass(level: LivePool['riskLevel']) {
  if (level === 'LOW') return 'bg-positive-subtle text-positive border-positive/30';
  if (level === 'MEDIUM') return 'bg-warning-subtle text-warning border-warning/30';
  return 'bg-negative-subtle text-negative border-negative/30';
}

function scoreClass(score: number) {
  if (score >= 70) return 'text-positive';
  if (score >= 40) return 'text-warning';
  return 'text-negative';
}

function fmtCount(n: number) {
  return n.toLocaleString('en-US');
}

export default function ScannerPage() {
  const { pools, isLoading, error, secondsAgo } = usePoolsData(30_000);
  const [search, setSearch] = useState('');
  const [minVolume1h, setMinVolume1h] = useState(0);
  const [minSwaps1h, setMinSwaps1h] = useState(0);
  const [riskLevels, setRiskLevels] = useState<LivePool['riskLevel'][]>(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);
  const [sortKey, setSortKey] = useState<SortKey>('volume1h');
  const [sortDesc, setSortDesc] = useState(true);

  const toggleRisk = (risk: LivePool['riskLevel']) => {
    setRiskLevels((current) => current.includes(risk) ? current.filter((r) => r !== risk) : [...current, risk]);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pools.filter((p) => {
      if (q && !p.pair.toLowerCase().includes(q) && !p.tokenA.toLowerCase().includes(q) && !p.tokenB.toLowerCase().includes(q)) return false;
      if ((p.volume1h ?? 0) < minVolume1h) return false;
      if (p.swapCount1h < minSwaps1h) return false;
      if (!riskLevels.includes(p.riskLevel)) return false;
      return true;
    });
  }, [pools, search, minVolume1h, minSwaps1h, riskLevels]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av: number;
    let bv: number;
    if (sortKey === 'riskLevel') {
      av = RISK_ORDER[a.riskLevel];
      bv = RISK_ORDER[b.riskLevel];
    } else {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      av = typeof aValue === 'number' ? aValue : 0;
      bv = typeof bValue === 'number' ? bValue : 0;
    }
    return sortDesc ? bv - av : av - bv;
  }), [filtered, sortKey, sortDesc]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const highFlowPools = pools.filter((p) => (p.volumeToTVL ?? 0) >= 3).length;
  const avgScore = filtered.length ? filtered.reduce((sum, p) => sum + p.analyticsScore, 0) / filtered.length : null;
  const latestPool = pools.reduce<string | null>((latest, p) => {
    if (!p.createdAt) return latest;
    if (!latest) return p.createdAt;
    return new Date(p.createdAt).getTime() > new Date(latest).getTime() ? p.createdAt : latest;
  }, null);

  const sortButton = (key: SortKey, label: string) => (
    <button onClick={() => setSort(key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}
      <Icon name={sortKey === key ? (sortDesc ? 'ChevronDownIcon' : 'ChevronUpIcon') : 'ChevronUpDownIcon'} size={11} className={sortKey === key ? 'text-primary' : 'text-muted-foreground/50'} />
    </button>
  );

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Flow Scanner</h1>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-muted/40 text-muted-foreground border border-border">V1 LIVE DATA</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Find pools with meaningful recent activity on Robinhood Chain.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pair..." className="input-field pl-8 w-52 text-sm h-9" />
            </div>
            {isLoading ? (
              <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground font-semibold">LOADING</span>
            ) : error ? (
              <span className="px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive text-xs text-destructive font-semibold">DATA ERROR</span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-positive-subtle border border-positive/30 text-xs text-positive font-semibold"><span className="live-dot" />LIVE{secondsAgo !== null ? ` • ${secondsAgo}s` : ''}</span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
            <Icon name="ExclamationTriangleIcon" size={16} className="text-destructive mt-0.5" />
            <div><p className="text-sm font-semibold text-destructive">Live data unavailable</p><p className="text-xs text-destructive/80 mt-0.5">{error}</p></div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Pools', isLoading ? '…' : pools.length.toString(), 'Discovered from subgraph'],
            ['High Flow', isLoading ? '…' : highFlowPools.toString(), 'Vol/TVL ≥ 3x'],
            ['Avg Score', isLoading ? '…' : avgScore === null ? 'N/A' : Math.round(avgScore).toString(), 'Filtered pools'],
            ['Newest Pool', isLoading ? '…' : ageLabel(latestPool), 'Created timestamp'],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <p className="data-label mb-1">{label}</p>
              <p className="text-xl font-bold font-mono-nums text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)] gap-5 items-start">
          <aside className="rounded-xl border border-border bg-card p-4 space-y-5 xl:sticky xl:top-24">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Filters</h2><button onClick={() => { setMinVolume1h(0); setMinSwaps1h(0); setRiskLevels(['LOW','MEDIUM','HIGH','EXTREME']); }} className="text-xs text-muted-foreground hover:text-foreground">Reset</button></div>
            <div>
              <p className="data-label mb-2">Min 1h Volume</p>
              <input type="range" min="0" max="1000000" step="10000" value={minVolume1h} onChange={(e) => setMinVolume1h(Number(e.target.value))} className="w-full accent-primary" />
              <p className="text-xs font-mono-nums text-foreground mt-1">{fmtUSD(minVolume1h)}</p>
            </div>
            <div>
              <p className="data-label mb-2">Min 1h Swaps</p>
              <input type="range" min="0" max="1000" step="10" value={minSwaps1h} onChange={(e) => setMinSwaps1h(Number(e.target.value))} className="w-full accent-primary" />
              <p className="text-xs font-mono-nums text-foreground mt-1">{fmtCount(minSwaps1h)}</p>
            </div>
            <div>
              <p className="data-label mb-2">Risk Level</p>
              <div className="space-y-1.5">
                {(['LOW','MEDIUM','HIGH','EXTREME'] as LivePool['riskLevel'][]).map((risk) => (
                  <button key={risk} onClick={() => toggleRisk(risk)} className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium ${riskLevels.includes(risk) ? riskClass(risk) : 'bg-muted/20 text-muted-foreground border-border'}`}>
                    {risk}{riskLevels.includes(risk) && <Icon name="CheckIcon" size={12} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
              Filters use only live fields. No holder counts, LP-lock labels, synthetic age, or unsupported 5m volume are inferred here.
            </div>
          </aside>

          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
              <div><h2 className="text-sm font-semibold">Pool Flow</h2><p className="text-xs text-muted-foreground mt-0.5">{filtered.length} of {pools.length} pools match</p></div>
              <Link href="/pool-scanner" className="text-xs text-primary hover:underline">Open full Pool Scanner →</Link>
            </div>
            {isLoading ? (
              <div className="p-10 flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /><p className="text-sm text-muted-foreground">Fetching live pools…</p></div>
            ) : sorted.length === 0 ? (
              <div className="p-10 text-center"><Icon name="FunnelIcon" size={26} className="mx-auto text-muted-foreground/40" /><p className="text-sm font-semibold mt-3">No pools match the current filters</p><p className="text-xs text-muted-foreground mt-1">Try lowering the activity thresholds.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr className="border-b border-border">
                    <th className="table-header-cell">Pool</th>
                    <th className="table-header-cell">Age</th>
                    <th className="table-header-cell">{sortButton('volume1h','1h Vol')}</th>
                    <th className="table-header-cell">{sortButton('volume6h','6h Vol')}</th>
                    <th className="table-header-cell">{sortButton('volume24h','24h Vol')}</th>
                    <th className="table-header-cell">{sortButton('volumeToTVL','Vol/TVL')}</th>
                    <th className="table-header-cell">{sortButton('swapCount1h','1h Swaps')}</th>
                    <th className="table-header-cell">{sortButton('swapCount24h','24h Swaps')}</th>
                    <th className="table-header-cell">Score</th>
                    <th className="table-header-cell">Risk</th>
                  </tr></thead>
                  <tbody>{sorted.map((pool) => (
                    <tr key={pool.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="table-row-cell"><Link href={`/pool-detail?address=${encodeURIComponent(pool.address)}`} className="group"><p className="text-sm font-semibold text-foreground group-hover:text-primary">{pool.pair}</p><p className="text-xs text-muted-foreground font-mono-nums">{pool.fee}% fee · step {pool.binStep}</p></Link></td>
                      <td className="table-row-cell text-xs font-mono-nums text-muted-foreground">{ageLabel(pool.createdAt)}</td>
                      <td className="table-row-cell font-mono-nums text-sm">{fmtUSD(pool.volume1h)}</td>
                      <td className="table-row-cell font-mono-nums text-sm">{fmtUSD(pool.volume6h)}</td>
                      <td className="table-row-cell font-mono-nums text-sm">{fmtUSD(pool.volume24h)}</td>
                      <td className="table-row-cell font-mono-nums text-sm font-semibold">{pool.volumeToTVL.toFixed(2)}x</td>
                      <td className="table-row-cell font-mono-nums text-xs">{fmtCount(pool.swapCount1h)}</td>
                      <td className="table-row-cell font-mono-nums text-xs">{fmtCount(pool.swapCount24h)}</td>
                      <td className="table-row-cell"><span className={`font-mono-nums font-bold ${scoreClass(pool.analyticsScore)}`}>{pool.analyticsScore}</span></td>
                      <td className="table-row-cell"><span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${riskClass(pool.riskLevel)}`}>{pool.riskLevel}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="rounded-xl border border-warning/20 bg-warning-subtle p-3 text-xs text-warning/80">
          <span className="font-semibold text-warning">V1 note:</span> activity and score are based on the live pool data currently exposed by the Robinhood subgraph. Historical charts, holder analysis, LP-lock verification, and transaction-level flow attribution remain separate future data paths.
        </div>
      </div>
    </AppLayout>
  );
}
