import React from 'react';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';

interface RiskPanelProps { pool: LivePool; }
interface RiskFactor { id: string; label: string; value: string; level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'; note: string; }

function gmgnValue(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? '—' : `${value.toLocaleString()}${suffix}`;
}

export default function RiskPanel({ pool }: RiskPanelProps) {
  const tvl = pool.tvl ?? 0;
  const priceMove = pool.priceChange24h === null || pool.priceChange24h === undefined ? null : Math.abs(pool.priceChange24h);
  const volumeToTVL = pool.volumeToTVL;
  const factors: RiskFactor[] = [
    { id: 'rf-move', label: '24h Price Move', value: priceMove === null ? '—' : `${priceMove.toFixed(1)}%`, level: priceMove === null ? 'MEDIUM' : priceMove > 25 ? 'EXTREME' : priceMove > 12 ? 'HIGH' : priceMove > 6 ? 'MEDIUM' : 'LOW', note: 'Absolute base-token price change' },
    { id: 'rf-tvl', label: 'Pool TVL', value: fmtUSD(pool.tvl, '—'), level: tvl === 0 ? 'EXTREME' : tvl < 2_500 ? 'EXTREME' : tvl < 10_000 ? 'HIGH' : tvl < 50_000 ? 'MEDIUM' : 'LOW', note: 'Lower TVL = higher price impact' },
    { id: 'rf-voltvl', label: 'Volume / TVL', value: volumeToTVL === null ? '—' : `${volumeToTVL.toFixed(2)}x`, level: volumeToTVL === null ? 'MEDIUM' : volumeToTVL > 20 ? 'EXTREME' : volumeToTVL > 10 ? 'HIGH' : volumeToTVL > 3 ? 'MEDIUM' : 'LOW', note: 'High ratio may indicate a volume spike' },
    { id: 'rf-binstep', label: 'Bin Step', value: `${pool.binStep} bps`, level: pool.binStep >= 20 ? 'HIGH' : pool.binStep >= 10 ? 'MEDIUM' : 'LOW', note: 'Price distance between neighboring bins' },
    { id: 'rf-contract', label: 'Protocol', value: pool.protocol || '—', level: 'MEDIUM', note: 'Protocol risk should be verified independently' },
  ];
  const overallLevel = pool.riskLevel;
  const gmgn = pool.gmgn;

  return <div className="space-y-3">
    <div className={`flex items-center justify-between p-3 rounded-xl border ${overallLevel === 'LOW' ? 'border-positive/30 bg-positive-subtle' : overallLevel === 'MEDIUM' ? 'border-warning/30 bg-warning-subtle' : 'border-negative/30 bg-negative-subtle'}`}>
      <div><p className="text-xs text-muted-foreground mb-0.5">Overall Risk Level</p><p className="text-base font-bold text-foreground">{pool.pair}</p></div><RiskBadge level={overallLevel} />
    </div>
    <div className="space-y-1.5">{factors.map((f) => <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border"><div className="flex items-center gap-2 min-w-0"><div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.level === 'LOW' ? 'bg-positive' : f.level === 'MEDIUM' ? 'bg-warning' : 'bg-negative'}`} /><div className="min-w-0"><p className="text-xs font-medium text-foreground">{f.label}</p><p className="text-xs text-muted-foreground/70 truncate">{f.note}</p></div></div><div className="flex items-center gap-2 flex-shrink-0"><span className="text-xs font-mono-nums text-foreground">{f.value}</span><RiskBadge level={f.level} /></div></div>)}</div>

    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-3"><div><p className="text-xs font-semibold text-foreground">GMGN Token Intelligence</p><p className="text-[11px] text-muted-foreground">Enrichment layer; pool metrics remain GeckoTerminal-first</p></div><span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${gmgn ? 'text-positive bg-positive-subtle border-positive/30' : 'text-muted-foreground bg-muted/40 border-border'}`}>{gmgn ? 'GMGN LIVE' : 'UNAVAILABLE'}</span></div>
      {gmgn ? <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Holders</p><p className="text-xs font-mono-nums text-foreground">{gmgnValue(gmgn.holderCount)}</p></div>
        <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Smart wallets</p><p className="text-xs font-mono-nums text-foreground">{gmgnValue(gmgn.smartWallets)}</p></div>
        <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Renowned wallets</p><p className="text-xs font-mono-nums text-foreground">{gmgnValue(gmgn.renownedWallets)}</p></div>
        <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Rug ratio</p><p className="text-xs font-mono-nums text-foreground">{gmgn.rugRatio == null ? '—' : `${gmgn.rugRatio.toFixed(2)}%`}</p></div>
        <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Wash trading</p><p className="text-xs font-mono-nums text-foreground">{gmgn.washTrading == null ? '—' : gmgn.washTrading ? 'Detected' : 'Not flagged'}</p></div>
        <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Exchange</p><p className="text-xs font-mono-nums text-foreground truncate">{gmgn.exchange || '—'}</p></div>
      </div> : <p className="text-xs text-muted-foreground">No GMGN enrichment was returned for this token. No missing value is converted into zero.</p>}
    </div>

    <div className="flex items-start gap-2 p-3 rounded-xl bg-negative-subtle border border-negative/20"><Icon name="ExclamationTriangleIcon" size={14} className="text-negative flex-shrink-0 mt-0.5" /><p className="text-xs text-negative/80 leading-relaxed">Risk scores are analytical indicators only. Market values are sourced from the live pool feed; a dash means the verified source did not return that field.</p></div>
  </div>;
}
