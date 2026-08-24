import React from 'react';
import { LivePool } from '@/lib/liveTypes';
import { RiskBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';

interface RiskPanelProps {
  pool: LivePool;
}

interface RiskFactor {
  id: string;
  label: string;
  value: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  note: string;
}

export default function RiskPanel({ pool }: RiskPanelProps) {
  const tvl = pool.tvl ?? 0;

  const factors: RiskFactor[] = [
    {
      id: 'rf-volatility',
      label: 'Token Volatility',
      value: `${pool.volatility.toFixed(1)}%`,
      level: pool.volatility > 10 ? 'EXTREME' : pool.volatility > 6 ? 'HIGH' : pool.volatility > 3 ? 'MEDIUM' : 'LOW',
      note: '24h price volatility',
    },
    {
      id: 'rf-tvl',
      label: 'Pool TVL',
      value: tvl >= 1_000_000 ? `$${(tvl / 1_000_000).toFixed(2)}M` : tvl >= 1_000 ? `$${(tvl / 1_000).toFixed(0)}K` : tvl > 0 ? `$${tvl.toFixed(0)}` : 'N/A',
      level: tvl === 0 ? 'EXTREME' : tvl < 200_000 ? 'EXTREME' : tvl < 1_000_000 ? 'HIGH' : tvl < 5_000_000 ? 'MEDIUM' : 'LOW',
      note: 'Lower TVL = higher price impact',
    },
    {
      id: 'rf-voltvl',
      label: 'Volume / TVL',
      value: `${pool.volumeToTVL.toFixed(2)}x`,
      level: pool.volumeToTVL > 20 ? 'EXTREME' : pool.volumeToTVL > 10 ? 'HIGH' : pool.volumeToTVL > 3 ? 'MEDIUM' : 'LOW',
      note: 'Very high ratio may indicate volume spike',
    },
    {
      id: 'rf-timeinrange',
      label: 'Time In Range',
      value: pool.timeInRange !== null ? `${pool.timeInRange.toFixed(1)}%` : 'N/A',
      level: pool.timeInRange === null ? 'MEDIUM' : pool.timeInRange < 50 ? 'HIGH' : pool.timeInRange < 70 ? 'MEDIUM' : 'LOW',
      note: 'Historical time price stays in typical range',
    },
    {
      id: 'rf-binstep',
      label: 'Bin Step',
      value: `${pool.binStep} bps`,
      level: pool.binStep >= 20 ? 'HIGH' : pool.binStep >= 10 ? 'MEDIUM' : 'LOW',
      note: 'Higher bin step = wider price range per bin',
    },
    {
      id: 'rf-contract',
      label: 'Smart Contract',
      value: 'Ramses DLMM',
      level: 'MEDIUM',
      note: 'Always verify contract audits independently',
    },
  ];

  const overallLevel = pool.riskLevel;

  return (
    <div className="space-y-3">
      {/* Overall */}
      <div className={`flex items-center justify-between p-3 rounded-xl border ${
        overallLevel === 'LOW' ? 'border-positive/30 bg-positive-subtle' :
        overallLevel === 'MEDIUM' ? 'border-warning/30 bg-warning-subtle' : 'border-negative/30 bg-negative-subtle'
      }`}>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Overall Risk Level</p>
          <p className="text-base font-bold text-foreground">{pool.pair}</p>
        </div>
        <RiskBadge level={overallLevel} />
      </div>

      {/* Factors */}
      <div className="space-y-1.5">
        {factors.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                f.level === 'LOW' ? 'bg-positive' :
                f.level === 'MEDIUM' ? 'bg-warning' : 'bg-negative'
              }`} />
              <div>
                <p className="text-xs font-medium text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground/70">{f.note}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-nums text-foreground">{f.value}</span>
              <RiskBadge level={f.level} />
            </div>
          </div>
        ))}
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-negative-subtle border border-negative/20">
        <Icon name="ExclamationTriangleIcon" size={14} className="text-negative flex-shrink-0 mt-0.5" />
        <p className="text-xs text-negative/80 leading-relaxed">
          Risk scores are analytical indicators only. A LOW risk score does not mean a pool is safe.
          Smart contract risk, token rug risk, and sudden liquidity withdrawal cannot be fully quantified.
          Never invest more than you can afford to lose.
        </p>
      </div>
    </div>
  );
}