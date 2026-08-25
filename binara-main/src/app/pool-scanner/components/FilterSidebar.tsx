'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export interface FilterState {
  minScore: number;
  minTVL: number;
  minVolume: number;
  minVolToTVL: number;
  minSwaps: number;
}

interface FilterSidebarProps { filters: FilterState; onChange: (f: FilterState) => void; onReset: () => void; }

function RangeInput({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return <div><div className="flex items-center justify-between mb-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label><span className="text-xs font-mono-nums text-foreground font-semibold">{format(value)}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-1.5 rounded-full bg-muted appearance-none cursor-pointer accent-primary" /><div className="flex justify-between mt-1"><span className="text-xs text-muted-foreground/60 font-mono-nums">{format(min)}</span><span className="text-xs text-muted-foreground/60 font-mono-nums">{format(max)}</span></div></div>;
}

export default function FilterSidebar({ filters, onChange, onReset }: FilterSidebarProps) {
  return <div className="w-64 flex-shrink-0 rounded-xl border border-border bg-card p-4 space-y-5 self-start sticky top-24">
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Live Filters</h3><button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Icon name="ArrowPathIcon" size={12} />Reset</button></div>

    <div className="space-y-3"><p className="data-label">Opportunity</p><RangeInput label="Min Score" value={filters.minScore} min={0} max={100} step={5} format={(v) => `${v}`} onChange={(v) => onChange({ ...filters, minScore: v })} /><p className="text-[11px] text-muted-foreground/70">Uses the same verified-data score shown in the scanner table.</p></div>

    <div className="space-y-3"><p className="data-label">Liquidity</p><RangeInput label="Min TVL" value={filters.minTVL} min={0} max={10_000_000} step={100_000} format={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`} onChange={(v) => onChange({ ...filters, minTVL: v })} /></div>

    <div className="space-y-3"><p className="data-label">Volume</p><RangeInput label="Min 24h Volume" value={filters.minVolume} min={0} max={30_000_000} step={500_000} format={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`} onChange={(v) => onChange({ ...filters, minVolume: v })} /><RangeInput label="Min Vol/TVL" value={filters.minVolToTVL} min={0} max={20} step={0.5} format={(v) => `${v.toFixed(1)}x`} onChange={(v) => onChange({ ...filters, minVolToTVL: v })} /></div>

    <div className="space-y-3"><p className="data-label">Activity</p><RangeInput label="Min Swaps 24h" value={filters.minSwaps} min={0} max={10_000} step={100} format={(v) => v.toLocaleString()} onChange={(v) => onChange({ ...filters, minSwaps: v })} /></div>

    <div className="rounded-lg bg-muted/40 border border-border p-3"><p className="text-xs font-semibold text-foreground mb-1.5">Data policy</p><p className="text-xs text-muted-foreground leading-relaxed">Score is N/A when required verified inputs are missing. N/A pools are excluded when a minimum score is applied.</p></div>

    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3"><p className="text-xs font-semibold text-foreground mb-1.5">Score weights</p><div className="space-y-1"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Efficiency</span><span className="font-mono-nums font-semibold">35%</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">24h Volume</span><span className="font-mono-nums font-semibold">25%</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Liquidity</span><span className="font-mono-nums font-semibold">25%</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Activity</span><span className="font-mono-nums font-semibold">15%</span></div></div></div>
  </div>;
}
