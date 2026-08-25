import React from 'react';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
type StatusType = 'in-range' | 'near-lower' | 'near-upper' | 'out-of-range' | 'active' | 'inactive';

interface RiskBadgeProps { level: RiskLevel | null; }
interface StatusBadgeProps { status: StatusType; }

export function RiskBadge({ level }: RiskBadgeProps) {
  if (!level) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">Risk N/A</span>;
  const classes: Record<RiskLevel, string> = {
    LOW: 'badge-risk-low',
    MEDIUM: 'badge-risk-medium',
    HIGH: 'badge-risk-high',
    EXTREME: 'badge-risk-extreme',
  };
  return <span className={classes[level]}>{level}</span>;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<StatusType, { label: string; dot: string; cls: string }> = {
    'in-range': { label: 'In Range', dot: 'bg-positive', cls: 'status-in-range' },
    'near-lower': { label: 'Near Lower', dot: 'bg-warning', cls: 'status-near-boundary' },
    'near-upper': { label: 'Near Upper', dot: 'bg-warning', cls: 'status-near-boundary' },
    'out-of-range': { label: 'Out of Range', dot: 'bg-negative', cls: 'status-out-of-range' },
    'active': { label: 'Active', dot: 'bg-positive', cls: 'status-in-range' },
    'inactive': { label: 'Inactive', dot: 'bg-muted-foreground', cls: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground' },
  };
  const c = config[status];
  return <span className={c.cls}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}</span>;
}

interface FeeBadgeProps { fee: number | null; }

export function FeeBadge({ fee }: FeeBadgeProps) {
  if (fee === null || !Number.isFinite(fee)) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono-nums font-semibold bg-muted text-muted-foreground border border-border">Fee N/A</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono-nums font-semibold bg-info-subtle text-info border border-info/30">{fee}%</span>;
}
