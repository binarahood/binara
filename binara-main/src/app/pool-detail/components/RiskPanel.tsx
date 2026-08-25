import React from 'react';
import { LivePool } from '@/lib/liveTypes';
import { RiskBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';

interface RiskPanelProps { pool: LivePool; }
interface RiskFactor { id: string; label: string; value: string; level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null; note: string; }

function factorLevel(value: number | null, thresholds: [number, 'EXTREME' | 'HIGH' | 'MEDIUM' | 'LOW'][]): RiskFactor['level'] {
  if (value === null || !Number.isFinite(value)) return null;
  for (const [threshold, level] of thresholds) if (value > threshold) return level;
  return 'LOW';
}

export default function RiskPanel({ pool }: RiskPanelProps) {
  const tvl = pool.tvl;
  const volatilityLevel = factorLevel(pool.volatility, [[10, 'EXTREME'], [6, 'HIGH'], [3, 'MEDIUM']]);
  const tvlLevel = tvl === null ? null : tvl < 200_000 ? 'EXTREME' : tvl < 1_000_000 ? 'HIGH' : tvl < 5_000_000 ? 'MEDIUM' : 'LOW';
  const ratioLevel = factorLevel(pool.volumeToTVL, [[20, 'EXTREME'], [10, 'HIGH'], [3, 'MEDIUM']]);
  const timeLevel = pool.timeInRange === null ? null : pool.timeInRange < 50 ? 'HIGH' : pool.timeInRange < 70 ? 'MEDIUM' : 'LOW';
  const binLevel = pool.binStep === null ? null : pool.binStep >= 20 ? 'HIGH' : pool.binStep >= 10 ? 'MEDIUM' : 'LOW';

  const factors: RiskFactor[] = [
    { id: 'rf-volatility', label: 'Token Volatility', value: pool.volatility === null ? 'N/A' : `${pool.volatility.toFixed(1)}%`, level: volatilityLevel, note: '24h price volatility' },
    { id: 'rf-tvl', label: 'Pool TVL', value: tvl === null ? 'N/A' : tvl >= 1_000_000 ? `$${(tvl / 1_000_000).toFixed(2)}M` : tvl >= 1_000 ? `$${(tvl / 1_000).toFixed(0)}K` : `$${tvl.toFixed(0)}`, level: tvlLevel, note: 'Lower TVL can mean higher price impact' },
    { id: 'rf-voltvl', label: 'Volume / TVL', value: pool.volumeToTVL === null ? 'N/A' : `${pool.volumeToTVL.toFixed(2)}x`, level: ratioLevel, note: 'Very high ratio may indicate a volume spike' },
    { id: 'rf-timeinrange', label: 'Time In Range', value: pool.timeInRange === null ? 'N/A' : `${pool.timeInRange.toFixed(1)}%`, level: timeLevel, note: 'Historical time price stays in typical range' },
    { id: 'rf-binstep', label: 'Bin Step', value: pool.binStep === null ? 'N/A' : `${pool.binStep} bps`, level: binLevel, note: 'Higher bin step means wider price change per bin' },
    { id: 'rf-contract', label: 'Smart Contract', value: 'Ramses DLMM', level: 'MEDIUM', note: 'Verify contract audits independently' },
  ];

  const overallLevel = pool.riskLevel;
  const panelClass = overallLevel === 'LOW' ? 'border-positive/30 bg-positive-subtle' : overallLevel === 'MEDIUM' ? 'border-warning/30 bg-warning-subtle' : overallLevel ? 'border-negative/30 bg-negative-subtle' : 'border-border bg-muted/20';

  return <div className="space-y-3">
    <div className={`flex items-center justify-between p-3 rounded-xl border ${panelClass}`}><div><p className="text-xs text-muted-foreground mb-0.5">Overall Risk Level</p><p className="text-base font-bold text-foreground">{pool.pair}</p></div><RiskBadge level={overallLevel} /></div>
    <div className="space-y-1.5">{factors.map((f) => <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.level === 'LOW' ? 'bg-positive' : f.level === 'MEDIUM' ? 'bg-warning' : f.level ? 'bg-negative' : 'bg-muted-foreground'}`} /><div><p className="text-xs font-medium text-foreground">{f.label}</p><p className="text-xs text-muted-foreground/70">{f.note}</p></div></div><div className="flex items-center gap-2"><span className="text-xs font-mono-nums text-foreground">{f.value}</span><RiskBadge level={f.level} /></div></div>)}</div>
    <div className="flex items-start gap-2 p-3 rounded-xl bg-warning-subtle border border-warning/20"><Icon name="ExclamationTriangleIcon" size={14} className="text-warning flex-shrink-0 mt-0.5" /><p className="text-xs text-warning/80 leading-relaxed">Risk is an analytical indicator, not a safety guarantee. When a verified risk input is unavailable, BINARA shows N/A instead of inventing a risk level.</p></div>
  </div>;
}
