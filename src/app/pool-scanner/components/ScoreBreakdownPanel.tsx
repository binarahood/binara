'use client';

import React from 'react';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';

interface Props {
  pool: LivePool;
  onClose: () => void;
}

export default function ScoreBreakdownPanel({ pool, onClose }: Props) {
  const hasScore = pool.analyticsScore !== null;
  const hasVolTVL = pool.volumeToTVL !== null;
  const hasVolatility = pool.volatility !== null;

  return (
    <div className="animate-slide-up rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex -space-x-1">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xs font-bold text-primary">{(pool.tokenA || '?')[0]}</div>
              <div className="w-7 h-7 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent">{(pool.tokenB || '?')[0]}</div>
            </div>
            <h3 className="text-base font-bold text-foreground">{pool.pair}</h3>
            <RiskBadge level={pool.riskLevel} />
          </div>
          <p className="text-xs text-muted-foreground font-mono-nums">{pool.address}</p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5"><Icon name="XMarkIcon" size={16} /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-xl bg-muted/30 border border-border">
        <div><p className="text-xs text-muted-foreground">TVL</p><p className="text-sm font-mono-nums font-semibold text-foreground">{fmtUSD(pool.tvl)}</p></div>
        <div><p className="text-xs text-muted-foreground">24h Vol</p><p className="text-sm font-mono-nums font-semibold text-foreground">{fmtUSD(pool.volume24h)}</p></div>
        <div><p className="text-xs text-muted-foreground">Vol / TVL</p><p className="text-sm font-mono-nums font-semibold text-foreground">{hasVolTVL ? `${pool.volumeToTVL!.toFixed(2)}x` : 'N/A'}</p></div>
        <div><p className="text-xs text-muted-foreground">Swaps 24h</p><p className="text-sm font-mono-nums font-semibold text-foreground">{pool.swapCount24h !== null ? pool.swapCount24h.toLocaleString() : 'N/A'}</p></div>
      </div>

      <div className="rounded-xl border border-warning/20 bg-warning-subtle p-4">
        <p className="text-sm font-semibold text-warning">Verified-data score status</p>
        <p className="text-xs text-warning/80 mt-1">
          {hasScore
            ? `Current analytics score: ${pool.analyticsScore}.`
            : 'Analytics Score is N/A because the verified inputs required to calculate it are not currently available.'}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Verified inputs</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-muted/30 border border-border"><p className="text-xs text-muted-foreground">Fee</p><p className="text-sm font-semibold font-mono-nums">{pool.fee}%</p></div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border"><p className="text-xs text-muted-foreground">Bin Step</p><p className="text-sm font-semibold font-mono-nums">{pool.binStep}</p></div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border"><p className="text-xs text-muted-foreground">Volatility</p><p className="text-sm font-semibold font-mono-nums">{hasVolatility ? `${pool.volatility!.toFixed(2)}%` : 'N/A'}</p></div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border"><p className="text-xs text-muted-foreground">Est. APR</p><p className="text-sm font-semibold font-mono-nums">{pool.estimatedAPR !== null ? `${pool.estimatedAPR.toFixed(1)}%` : 'N/A'}</p></div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 border-t border-border pt-3">
        BINARA does not substitute missing market data with estimates or fabricated risk/score values. A future score can be added once the verified Swap/price-history inputs are available.
      </p>
    </div>
  );
}
