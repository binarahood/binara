'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge, FeeBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';

type SortKey = 'tvl' | 'volume24h' | 'fee' | 'volumeToTVL' | 'volatility' | 'estimatedAPR' | 'analyticsScore' | 'timeInRange';

function getSortValue(pool: LivePool, key: SortKey): number {
  switch (key) {
    case 'tvl': return pool.tvl ?? 0;
    case 'volume24h': return pool.volume24h ?? 0;
    case 'fee': return pool.fee;
    case 'volumeToTVL': return pool.volumeToTVL ?? 0;
    case 'volatility': return pool.volatility ?? 0;
    case 'estimatedAPR': return pool.estimatedAPR ?? 0;
    case 'analyticsScore': return pool.analyticsScore ?? 0;
    case 'timeInRange': return pool.timeInRange ?? 0;
  }
}

interface Props {
  pools: LivePool[];
  onSelect: (pool: LivePool) => void;
  selectedId?: string;
}

export default function ScannerTable({ pools, onSelect, selectedId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('analyticsScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...pools].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <Icon name="ChevronUpDownIcon" size={11} className="text-muted-foreground/40" />;
    return sortDir === 'desc'
      ? <Icon name="ChevronDownIcon" size={11} className="text-primary" />
      : <Icon name="ChevronUpIcon" size={11} className="text-primary" />;
  };

  const headers: { label: string; key: SortKey }[] = [
    { label: 'TVL', key: 'tvl' },
    { label: '24h Vol', key: 'volume24h' },
    { label: 'Fee', key: 'fee' },
    { label: 'Vol/TVL', key: 'volumeToTVL' },
    { label: 'Volatility', key: 'volatility' },
    { label: 'Time In Range', key: 'timeInRange' },
    { label: 'Est. APR*', key: 'estimatedAPR' },
    { label: 'Score', key: 'analyticsScore' },
  ];

  if (pools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center mb-3">
          <Icon name="FunnelIcon" size={22} className="text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">No pools match your filters</p>
        <p className="text-xs text-muted-foreground mt-1">Try loosening the filter constraints</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="table-header-cell">#</th>
            <th className="table-header-cell">Pool</th>
            {headers.map((h) => (
              <th key={`scanner-th-${h.key}`} className="table-header-cell cursor-pointer" onClick={() => handleSort(h.key)}>
                <span className="flex items-center gap-1">
                  {h.label}
                  <SortIcon k={h.key} />
                </span>
              </th>
            ))}
            <th className="table-header-cell">Risk</th>
            <th className="table-header-cell">Swaps 24h</th>
            <th className="table-header-cell">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pool, idx) => (
            <tr
              key={pool.id}
              onClick={() => onSelect(pool)}
              className={`border-b border-border/50 cursor-pointer transition-colors duration-100 group ${selectedId === pool.id ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/30'}`}
            >
              <td className="table-row-cell text-muted-foreground font-mono-nums text-xs">{idx + 1}</td>
              <td className="table-row-cell">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1">
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xs font-bold text-primary">
                      {(pool.tokenA || '?')[0]}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent">
                      {(pool.tokenB || '?')[0]}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{pool.pair || 'Unknown pair'}</p>
                    <p className="text-xs text-muted-foreground">Step {pool.binStep ?? 'N/A'} · {pool.protocol || 'DLMM'}</p>
                  </div>
                </div>
              </td>
              <td className="table-row-cell font-mono-nums text-foreground">{fmtUSD(pool.tvl)}</td>
              <td className="table-row-cell">
                <span className={`font-mono-nums font-semibold ${(pool.volume24h ?? 0) > (pool.tvl ?? 0) ? 'text-positive' : 'text-foreground'}`}>
                  {fmtUSD(pool.volume24h)}
                </span>
              </td>
              <td className="table-row-cell"><FeeBadge fee={pool.fee} /></td>
              <td className="table-row-cell">
                <span className={`font-mono-nums font-semibold ${(pool.volumeToTVL ?? 0) > 5 ? 'text-positive' : (pool.volumeToTVL ?? 0) > 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {pool.volumeToTVL != null ? `${pool.volumeToTVL.toFixed(2)}x` : 'N/A'}
                </span>
              </td>
              <td className="table-row-cell">
                <span className={`font-mono-nums ${
                  (pool.volatility ?? 0) > 8 ? 'text-negative' : (pool.volatility ?? 0) > 4 ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {pool.volatility != null ? `${pool.volatility.toFixed(1)}%` : 'N/A'}
                </span>
              </td>
              <td className="table-row-cell">
                {pool.timeInRange !== null && pool.timeInRange !== undefined ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(pool.timeInRange ?? 0) >= 85 ? 'bg-positive' : (pool.timeInRange ?? 0) >= 70 ? 'bg-warning' : 'bg-negative'}`}
                        style={{ width: `${Math.max(0, Math.min(100, pool.timeInRange ?? 0))}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono-nums text-muted-foreground">{(pool.timeInRange ?? 0).toFixed(0)}%</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </td>
              <td className="table-row-cell">
                <span className={`font-mono-nums font-semibold text-xs ${(pool.estimatedAPR ?? 0) > 100 ? 'text-positive' : (pool.estimatedAPR ?? 0) > 50 ? 'text-info' : 'text-muted-foreground'}`}>
                  {pool.estimatedAPR !== null && pool.estimatedAPR !== undefined ? `${pool.estimatedAPR.toFixed(1)}%` : 'N/A'}
                </span>
              </td>
              <td className="table-row-cell">
                <div className="flex items-center gap-1.5">
                  <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(pool.analyticsScore ?? 0) >= 80 ? 'bg-positive' : (pool.analyticsScore ?? 0) >= 60 ? 'bg-warning' : 'bg-negative'}`}
                      style={{ width: `${Math.max(0, Math.min(100, pool.analyticsScore ?? 0))}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono-nums font-bold ${(pool.analyticsScore ?? 0) >= 80 ? 'text-positive' : (pool.analyticsScore ?? 0) >= 60 ? 'text-warning' : 'text-negative'}`}>
                    {pool.analyticsScore ?? 'N/A'}
                  </span>
                </div>
              </td>
              <td className="table-row-cell"><RiskBadge level={pool.riskLevel} /></td>
              <td className="table-row-cell font-mono-nums text-muted-foreground text-xs">
                {pool.swapCount24h != null ? pool.swapCount24h.toLocaleString() : 'N/A'}
              </td>
              <td className="table-row-cell">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button onClick={(e) => { e.stopPropagation(); onSelect(pool); }} className="btn-ghost text-xs px-2 py-1" title="View score breakdown">
                    <Icon name="ChartBarIcon" size={13} />
                  </button>
                  <Link href={`/pool-detail?address=${pool.address}`} onClick={(e) => e.stopPropagation()} className="btn-ghost text-xs px-2 py-1" title="Open pool detail">
                    <Icon name="ArrowTopRightOnSquareIcon" size={13} />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground/60">* APR estimates based on recent fee activity. Not guaranteed.</p>
        <p className="text-xs text-muted-foreground font-mono-nums">{pools.length} pool{pools.length !== 1 ? 's' : ''} shown</p>
      </div>
    </div>
  );
}
