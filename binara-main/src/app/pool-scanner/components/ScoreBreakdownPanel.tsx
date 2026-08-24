'use client';

import React from 'react';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import dynamic from 'next/dynamic';

const ScoreRadialChart = dynamic(() => import('./ScoreRadialChart'), { ssr: false });

interface Props {
  pool: LivePool;
  onClose: () => void;
}

function ScoreComponent({
  label,
  score,
  weight,
  description,
}: {
  label: string;
  score: number;
  weight: number;
  description: string;
}) {
  const color =
    score >= 80 ? 'bg-positive' : score >= 60 ? 'bg-warning' : 'bg-negative';
  const textColor =
    score >= 80 ? 'text-positive' : score >= 60 ? 'text-warning' : 'text-negative';

  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono-nums">{weight}%</span>
          <span className={`text-sm font-bold font-mono-nums ${textColor}`}>{score}</span>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export default function ScoreBreakdownPanel({ pool, onClose }: Props) {
  const feeTierScore = pool.fee <= 0.05 ? 70 : pool.fee <= 0.1 ? 80 : pool.fee <= 0.3 ? 90 : 60;
  const consistencyScore = pool.volatility < 3 ? 90 : pool.volatility < 6 ? 70 : pool.volatility < 10 ? 50 : 30;
  const timeInRangeScore = pool.timeInRange ?? 50;
  const riskScore = pool.riskLevel === 'LOW' ? 95 : pool.riskLevel === 'MEDIUM' ? 70 : pool.riskLevel === 'HIGH' ? 40 : 10;
  const volTVLScore = Math.min(100, pool.volumeToTVL * 20);

  return (
    <div className="animate-slide-up rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex -space-x-1">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xs font-bold text-primary">
                {pool.tokenA[0]}
              </div>
              <div className="w-7 h-7 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent">
                {pool.tokenB[0]}
              </div>
            </div>
            <h3 className="text-base font-bold text-foreground">{pool.pair}</h3>
            <RiskBadge level={pool.riskLevel} />
          </div>
          <p className="text-xs text-muted-foreground font-mono-nums">{pool.address}</p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      {/* Overall score */}
      <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border">
        <ScoreRadialChart score={pool.analyticsScore} />
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Analytics Score</p>
          <p className="text-3xl font-bold font-mono-nums text-foreground">{pool.analyticsScore}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pool.analyticsScore >= 80
              ? 'Strong opportunity'
              : pool.analyticsScore >= 60
              ? 'Moderate opportunity' : 'Weak opportunity'}
          </p>
          <p className="text-xs text-warning mt-1">Not a profit guarantee</p>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-x-4 gap-y-1 text-right">
          <div>
            <p className="text-xs text-muted-foreground">TVL</p>
            <p className="text-sm font-mono-nums font-semibold text-foreground">{fmtUSD(pool.tvl)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">24h Vol</p>
            <p className="text-sm font-mono-nums font-semibold text-positive">{fmtUSD(pool.volume24h)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Est. APR*</p>
            <p className="text-sm font-mono-nums font-semibold text-positive">
              {pool.estimatedAPR !== null ? `${pool.estimatedAPR.toFixed(1)}%` : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Time In Range</p>
            <p className="text-sm font-mono-nums font-semibold text-foreground">
              {pool.timeInRange !== null ? `${pool.timeInRange.toFixed(1)}%` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Component breakdown */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Score Components</p>
        <div className="space-y-2">
          <ScoreComponent
            label="Vol / TVL Efficiency"
            score={Math.round(volTVLScore)}
            weight={30}
            description={`${pool.volumeToTVL.toFixed(2)}x — ${pool.volumeToTVL > 5 ? 'High fee capture efficiency' : 'Moderate fee capture efficiency'}`}
          />
          <ScoreComponent
            label="Fee Tier"
            score={feeTierScore}
            weight={20}
            description={`${pool.fee}% fee — ${pool.fee >= 0.3 ? 'Higher fee tier favors LPs in volatile markets' : 'Lower fee tier favors high-frequency trading pools'}`}
          />
          <ScoreComponent
            label="Volume Consistency"
            score={consistencyScore}
            weight={20}
            description={`Volatility ${pool.volatility.toFixed(1)}% — ${pool.volatility < 4 ? 'Consistent volume pattern' : 'Volatile — spikes may inflate short-term estimates'}`}
          />
          <ScoreComponent
            label="Time In Range"
            score={Math.round(timeInRangeScore)}
            weight={15}
            description={pool.timeInRange !== null ? `${pool.timeInRange.toFixed(1)}% of time price stays in typical LP range` : 'Insufficient data to calculate'}
          />
          <ScoreComponent
            label="Risk Adjustment"
            score={riskScore}
            weight={15}
            description={`${pool.riskLevel} risk — ${pool.riskLevel === 'LOW' ? 'Established tokens, stable liquidity' : pool.riskLevel === 'MEDIUM' ? 'Moderate risk factors present' : 'High volatility or thin liquidity'}`}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 border-t border-border pt-3">
        * Analytics Score and APR estimates are based on recent historical data. Not a prediction of future returns.
        Always assess your own risk tolerance before providing liquidity.
      </p>
    </div>
  );
}