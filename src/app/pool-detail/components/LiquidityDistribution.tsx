'use client';

import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

function priceFromBinId(binId: number, binStep: number, decimalsX = 18, decimalsY = 18): number {
  if (!Number.isFinite(binId) || !Number.isFinite(binStep)) return 0;
  const base = 1 + binStep / 10_000;
  const raw = Math.pow(base, binId - 8_388_608);
  const price = raw * 10 ** (decimalsX - decimalsY);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

interface BinData { binId: number; price: number; liquidityA: number; liquidityB: number; total: number; isActive: boolean; }
function formatLiq(v: number) { if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`; if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`; return `$${v}`; }
interface BinTooltipProps { active?: boolean; payload?: Array<{ payload: BinData }>; }
function BinTooltip({ active, payload }: BinTooltipProps) {
  if (!active || !payload?.length) return null; const bin = payload[0].payload;
  return <div className="rounded-xl border border-border bg-card p-3 shadow-xl text-xs min-w-[180px] z-50">
    <div className="flex items-center justify-between mb-2"><span className="font-semibold text-foreground">Bin #{bin.binId}</span>{bin.isActive && <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-xs font-semibold">ACTIVE</span>}</div>
    <div className="space-y-1"><div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-mono-nums text-foreground">{bin.price >= 1000 ? `$${bin.price.toFixed(2)}` : `$${bin.price.toFixed(6)}`}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Total Liquidity</span><span className="font-mono-nums text-foreground">{formatLiq(bin.total)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Token X (bid)</span><span className="font-mono-nums text-positive">{formatLiq(bin.liquidityA)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Token Y (ask)</span><span className="font-mono-nums text-info">{formatLiq(bin.liquidityB)}</span></div></div>
  </div>;
}
interface LiquidityDistributionProps { lowerRange?: number; upperRange?: number; poolAddress?: string; activeBin?: number | null; binStep?: number; }
export default function LiquidityDistribution({ lowerRange, upperRange, activeBin, binStep = 5 }: LiquidityDistributionProps) {
  const [view, setView] = useState<'distribution' | 'depth'>('distribution');
  const bins: BinData[] = React.useMemo(() => {
    if (activeBin === null || activeBin === undefined) return [];
    const result: BinData[] = []; const range = 20;
    for (let i = activeBin - range; i <= activeBin + range; i++) {
      const price = priceFromBinId(i, binStep); const distFromActive = Math.abs(i - activeBin); const liquidityFactor = Math.exp(-0.15 * distFromActive); const baseLiq = 10_000 * liquidityFactor;
      const liquidityA = i <= activeBin ? baseLiq * 0.8 : baseLiq * 0.2; const liquidityB = i >= activeBin ? baseLiq * 0.8 : baseLiq * 0.2;
      result.push({ binId: i, price, liquidityA, liquidityB, total: liquidityA + liquidityB, isActive: i === activeBin });
    }
    return result;
  }, [activeBin, binStep]);
  if (activeBin === null || activeBin === undefined) return <div className="flex items-center justify-center h-48"><p className="text-xs text-muted-foreground">Active bin data unavailable — liquidity distribution requires indexed pool data</p></div>;
  const activePrice = priceFromBinId(activeBin, binStep);
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">{(['distribution', 'depth'] as const).map((v) => <button key={v} suppressHydrationWarning onClick={() => setView(v)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{v === 'distribution' ? 'Distribution' : 'Depth'}</button>)}</div>
      <div className="flex items-center gap-3 text-xs"><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-positive" /><span className="text-muted-foreground">Token X</span></div><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-info" /><span className="text-muted-foreground">Token Y</span></div><div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-primary" /><span className="text-muted-foreground">Active</span></div></div></div>
    <div className="text-xs text-muted-foreground/60 bg-muted/20 rounded-lg px-3 py-1.5">Distribution estimated from active bin #{activeBin} · Price: {activePrice >= 1000 ? `$${activePrice.toFixed(2)}` : `$${activePrice.toFixed(6)}`} · Bin step: {binStep}</div>
    <ResponsiveContainer width="100%" height={220}><BarChart data={bins} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={6}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="binId" tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }} axisLine={false} tickLine={false} interval={9} /><YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatLiq} width={48} /><Tooltip content={<BinTooltip />} />
      {activePrice && <ReferenceLine x={activeBin} stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 2" label={{ value: 'Active', fill: 'var(--primary)', fontSize: 10, position: 'top' }} />}
      {lowerRange && <ReferenceLine x={bins.find((b) => b.price >= lowerRange)?.binId} stroke="var(--warning)" strokeWidth={1} strokeDasharray="3 3" />}{upperRange && <ReferenceLine x={bins.find((b) => b.price >= upperRange)?.binId} stroke="var(--warning)" strokeWidth={1} strokeDasharray="3 3" />}
      <Bar dataKey="liquidityA" name="Token X" stackId="liq" fill="var(--positive)" opacity={0.8} radius={[0, 0, 0, 0]}>{bins.map((entry) => <Cell key={`cell-a-${entry.binId}`} fill={entry.isActive ? 'var(--primary)' : 'var(--positive)'} opacity={entry.isActive ? 1 : 0.7} />)}</Bar>
      <Bar dataKey="liquidityB" name="Token Y" stackId="liq" fill="var(--info)" opacity={0.7} radius={[2, 2, 0, 0]}>{bins.map((entry) => <Cell key={`cell-b-${entry.binId}`} fill={entry.isActive ? 'var(--accent)' : 'var(--info)'} opacity={entry.isActive ? 1 : 0.6} />)}</Bar>
    </BarChart></ResponsiveContainer>
    <p className="text-xs text-muted-foreground/50 text-center">* Bin liquidity distribution is estimated. Real per-bin reserves require subgraph integration.</p>
  </div>;
}
