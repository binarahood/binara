import React from 'react';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
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
  const volatility = pool.volatility;
  const volumeToTVL = pool.volumeToTVL;
  const timeInRange = pool.timeInRange;

  const factors: RiskFactor[] = [
    {
      id: 'rf-volatility',
      label: 'Token Volatility',
      value: volatility === null ? 'N/A' : `${volatility.toFixed(1)}%`,
      level: volatility === null ? 'MEDIUM' : volatility > 10 ? 'EXTREME' : volatility > 6 ? 'HIGH' : volatility > 3 ? 'MEDIUM' : 'LOW',
      note: volatility === null ? 'Verified 24h volatility unavailable' : '24h price volatility',
    },
    {
      id: 'rf-tvl',
      label: 'Pool TVL',
      value: fmtUSD(pool.tvl),
      level: tvl === 0 ? 'EXTREME' : tvl < 200_000 ? 'EXTREME' : tvl < 1_000_000 ? 'HIGH' : tvl < 5_000_000 ? 'MEDIUM' : 'LOW',
      note: 'Lower TVL = higher price impact',
    },
    {
      id: 'rf-voltvl',
      label: 'Volume / TVL',
      value: volumeToTVL === null ? 'N/A' : `${volumeToTVL.toFixed(2)}x`,
      level: volumeToTVL === null ? 'MEDIUM' : volumeToTVL > 20 ? 'EXTREME' : volumeToTVL > 10 ? 'HIGH' : volumeToTVL > 3 ? 'MEDIUM' : 'LOW',
      note: volumeToTVL === null ? 'Verified volume or TVL unavailable' : 'Very high ratio may indicate volume spike',
    },
    {
      id: 'rf-timeinrange',
      label: 'Time In Range',
      value: timeInRange === null ? 'N/A' : `${timeInRange.toFixed(1)}%`,
      level: timeInRange === null ? 'MEDIUM' : timeInRange < 50 ? 'HIGH' : timeInRange < 70 ? 'MEDIUM' : 'LOW',
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
      value: pool.protocol,
      level: 'MEDIUM',
      note: 'Verify protocol and contract risk independently',
    },
  ];

  const overallLevel = pool.riskLevel;

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between p-3 rounded-xl border ${
        overallLevel === 'LOW' ? 'border-positive/30 bg-positive-subtle' :
        overallLevel === 'MEDIUM' ? 'border-warning/30 bg-warning-subtle' :
        'border-negative/30 bg-negative-subtle'
      }`}>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Overall Risk Level</p>
          <p className="text-base font-bold text-foreground">{pool.pair}</p>
        </div>
        <RiskBadge level={overallLevel} />
      </div>

      <div className="space-y-1.5">
        {factors.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                f.level === 'LOW' ? 'bg-positive' : f.level === 'MEDIUM' ? 'bg-warning' : 'bg-negative'
              }`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground/70 truncate">{f.note}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-mono-nums text-foreground">{f.value}</span>
              <RiskBadge level={f.level} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-negative-subtle border border-negative/20">
        <Icon name="ExclamationTriangleIcon" size={14} className="text-negative flex-shrink-0 mt-0.5" />
        <p className="text-xs text-negative/80 leading-relaxed">
          Risk scores are analytical indicators only. N/A means a verified input is unavailable; it is not treated as a zero-value risk signal.
        </p>
      </div>
    </div>
  );
}
