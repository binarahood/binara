import React from 'react';

interface FeeAnalyticsProps {
  estimatedAPR: number | null;
  volume24h: number | null;
  fee: number;
  tvl: number | null;
  activeLiquidity: number | null;
}

function fmtUSD(n: number | null) {
  if (n === null || n === undefined) return 'N/A';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function FeeAnalytics({ estimatedAPR, volume24h, fee, tvl, activeLiquidity }: FeeAnalyticsProps) {
  const feesPerDay = volume24h !== null ? volume24h * (fee / 100) : null;
  const feesPerHour = feesPerDay !== null ? feesPerDay / 24 : null;
  const weeklyFees = feesPerDay !== null ? feesPerDay * 7 : null;
  const monthlyFees = feesPerDay !== null ? feesPerDay * 30 : null;
  const volumeCaptured = activeLiquidity !== null && tvl !== null && tvl > 0
    ? `${((activeLiquidity / tvl) * 100).toFixed(1)}%`
    : 'N/A';

  const rows = [
    { label: 'Fees Today (est.)', value: fmtUSD(feesPerDay), note: 'Based on 24h volume' },
    { label: 'Fees per Hour (est.)', value: fmtUSD(feesPerHour), note: 'Avg over 24h' },
    { label: 'Weekly Fees (est.)', value: fmtUSD(weeklyFees), note: 'If volume persists' },
    { label: 'Monthly Fees (est.)', value: fmtUSD(monthlyFees), note: 'If volume persists' },
    { label: 'Volume Captured', value: volumeCaptured, note: 'Active / Total TVL' },
    { label: 'Est. APR (recent data)', value: estimatedAPR !== null ? `${estimatedAPR.toFixed(1)}%` : 'N/A', note: 'Not guaranteed', highlight: true },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={`fee-row-${row.label}`}
          className={`flex items-center justify-between p-2.5 rounded-lg ${
            row.highlight ? 'bg-positive-subtle border border-positive/20' : 'bg-muted/30 border border-border'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-foreground">{row.label}</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">{row.note}</p>
          </div>
          <span className={`text-sm font-mono-nums font-bold ${row.highlight ? 'text-positive' : 'text-foreground'}`}>
            {row.value}
          </span>
        </div>
      ))}
      <div className="rounded-lg bg-warning-subtle border border-warning/20 p-2.5 mt-2">
        <p className="text-xs text-warning/80">
          Recent fee rate is based on a short observation period and may not persist.
          Volume spikes can significantly inflate short-term APR estimates.
        </p>
      </div>
    </div>
  );
}