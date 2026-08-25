'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

type Candidate = { address: string; symbol: string; decimals: number | null; firstPool: string; createdAt: string | null; createdBlock: number };
type ApiResponse = { status: string; count: number; windowMinutes: number; blockNumber: number; tokens: Candidate[]; source: string; detail?: string };

export default function NewTokensPage() {
  const [minutes, setMinutes] = useState(60);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/chain/new-tokens?minutes=${minutes}`, { cache: 'no-store' });
      const body = await response.json() as ApiResponse;
      if (!response.ok || body.status !== 'live') throw new Error(body.detail || 'Unable to retrieve live token candidates');
      setData(body); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to retrieve live token candidates'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, [minutes]);

  const tokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.tokens || [];
    return (data?.tokens || []).filter((token) => token.symbol.toLowerCase().includes(q) || token.address.toLowerCase().includes(q) || token.firstPool.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h1 className="text-2xl font-bold text-foreground">New Token Scanner</h1><p className="text-sm text-muted-foreground mt-0.5">Live token candidates observed through newly created DLMM pools</p></div>
          <div className="flex items-center gap-2">
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="input-field h-9 text-sm"><option value={15}>Last 15m</option><option value={60}>Last 1h</option><option value={360}>Last 6h</option><option value={1440}>Last 24h</option></select>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${loading ? 'bg-muted/40 border-border' : error ? 'bg-destructive/10 border-destructive' : 'bg-positive-subtle border-positive/30'}`}><div className={loading ? 'w-2 h-2 rounded-full bg-muted-foreground animate-pulse' : error ? 'w-2 h-2 rounded-full bg-destructive' : 'live-dot'} /><span className={`text-xs font-semibold ${error ? 'text-destructive' : loading ? 'text-muted-foreground' : 'text-positive'}`}>{loading ? 'LOADING' : error ? 'DATA ERROR' : 'LIVE'}</span></div>
          </div>
        </div>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"><p className="text-sm font-semibold text-destructive">Live data unavailable</p><p className="text-xs text-destructive/80 mt-1">{error}</p></div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Metric label="Candidates" value={data ? data.count : null} /><Metric label="Matching Search" value={data ? tokens.length : null} /><Metric label="Window" value={data ? `${data.windowMinutes}m` : null} /><Metric label="Block" value={data ? data.blockNumber.toLocaleString() : null} /></div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap"><div><h2 className="text-sm font-semibold">Recently Observed Tokens</h2><p className="text-xs text-muted-foreground mt-0.5">Tokens first observed through a newly created DLMM pool in the selected window.</p></div><div className="relative"><Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search token or address" className="input-field pl-8 h-9 text-sm w-60" /></div></div>
          {loading ? <div className="p-10 text-center text-sm text-muted-foreground">Fetching live token candidates…</div> : tokens.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-semibold">No candidates found</p><p className="text-xs text-muted-foreground mt-1">No placeholder data is used.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left"><th className="px-4 py-3 data-label">Token</th><th className="px-4 py-3 data-label">Address</th><th className="px-4 py-3 data-label">First Pool</th><th className="px-4 py-3 data-label">Created</th><th className="px-4 py-3 data-label text-right">Block</th></tr></thead><tbody>{tokens.map((token) => <tr key={token.address} className="border-b border-border/60 hover:bg-muted/30"><td className="px-4 py-3 font-semibold">{token.symbol}</td><td className="px-4 py-3 font-mono text-xs text-muted-foreground">{token.address}</td><td className="px-4 py-3 font-mono text-xs text-muted-foreground">{token.firstPool}</td><td className="px-4 py-3 text-xs text-muted-foreground">{token.createdAt ? new Date(token.createdAt).toLocaleString() : 'N/A'}</td><td className="px-4 py-3 text-right font-mono text-xs">{token.createdBlock.toLocaleString()}</td></tr>)}</tbody></table></div>}
        </div>
        <div className="rounded-xl border border-info/20 bg-info-subtle p-3"><p className="text-xs text-info/80"><span className="font-semibold text-info">Data policy:</span> this scanner identifies tokens newly observed through new DLMM pools. It does not claim the token contract itself was deployed during this window and does not assign a profitability score without verified inputs.</p></div>
      </div>
    </AppLayout>
  );
}

function Metric({ label, value }: { label: string; value: number | string | null }) { return <div className="rounded-xl border border-border bg-card p-3"><p className="data-label mb-1">{label}</p><p className="text-xl font-bold font-mono-nums">{value === null ? 'N/A' : value}</p></div>; }
