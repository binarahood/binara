'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge, FeeBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import { usePoolsData } from '@/hooks/useChainData';

type SortKey = 'tvl' | 'volume24h' | 'fee' | 'volumeToTVL' | 'volatility' | 'estimatedAPR' | 'analyticsScore';

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-positive' : score >= 60 ? 'bg-warning' : 'bg-negative';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono-nums font-semibold ${
        score >= 80 ? 'text-positive' : score >= 60 ? 'text-warning' : 'text-negative'
      }`}>
        {score}
      </span>
    </div>
  );
}

function getSortValue(pool: LivePool, key: SortKey): number {
  switch (key) {
    case 'tvl': return pool.tvl ?? 0;
    case 'volume24h': return pool.volume24h ?? 0;
    case 'fee': return pool.fee;
    case 'volumeToTVL': return pool.volumeToTVL;
    case 'volatility': return pool.volatility;
    case 'estimatedAPR': return pool.estimatedAPR ?? 0;
    case 'analyticsScore': return pool.analyticsScore;
  }
}

export default function TopPoolsTable() {
  const [sortKey, setSortKey] = useState<SortKey>('analyticsScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { pools, isLoading, error, indexerStatus } = usePoolsData(30_000);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...pools].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <Icon name="ChevronUpDownIcon" size={12} className="text-muted-foreground/40" />;
    return sortDir === 'desc'
      ? <Icon name="ChevronDownIcon" size={12} className="text-primary" />
      : <Icon name="ChevronUpIcon" size={12} className="text-primary" />;
  };

  const headers: { label: string; key: SortKey }[] = [
    { label: 'TVL', key: 'tvl' },
    { label: '24h Volume', key: 'volume24h' },
    { label: 'Fee', key: 'fee' },
    { label: 'Vol/TVL', key: 'volumeToTVL' },
    { label: 'Volatility', key: 'volatility' },
    { label: 'Est. APR', key: 'estimatedAPR' },
    { label: 'Score', key: 'analyticsScore' },
  ];

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs text-muted-foreground">Loading live pool data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-destructive">DATA CONNECTION ERROR</p>
        <p className="text-xs text-muted-foreground text-center">Unable to retrieve live Robinhood Chain data.</p>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-warning border-t-transparent animate-spin mb-1" />
        <p className="text-sm font-semibold text-foreground">
          {indexerStatus === 'indexing' ? 'Indexing pools…' : 'No pools discovered yet'}
        </p>
        <p className="text-xs text-muted-foreground text-center">
          Scanning Ramses DLMM factory on Robinhood Chain (ID 4663)
        </p>
        <p className="text-xs text-muted-foreground/60 font-mono-nums text-center">
          Factory: 0xdcD5F77697914E27f56FD263EF82923C8524AbAc
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="table-header-cell">Pool</th>
            {headers.map((h) => (
              <th
                key={`th-${h.key}`}
                className="table-header-cell cursor-pointer"
                onClick={() => handleSort(h.key)}
              >
                <span className="flex items-center gap-1">
                  {h.label}
                  <SortIcon k={h.key} />
                </span>
              </th>
            ))}
            <th className="table-header-cell">Risk</th>
            <th className="table-header-cell"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pool) => (
            <tr
              key={pool.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100 group"
            >
              <td className="table-row-cell">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1">
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xs font-bold text-primary">
                      {pool.tokenA[0]}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent">
                      {pool.tokenB[0]}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{pool.pair}</p>
                    <p className="text-xs text-muted-foreground">Step {pool.binStep}</p>
                  </div>
                </div>
              </td>
              <td className="table-row-cell text-foreground">{fmtUSD(pool.tvl)}</td>
              <td className="table-row-cell">
                <span className={`font-mono-nums font-semibold ${
                  (pool.volume24h ?? 0) > (pool.tvl ?? 0) ? 'text-positive' : 'text-foreground'
                }`}>
                  {fmtUSD(pool.volume24h)}
                </span>
              </td>
              <td className="table-row-cell">
                <FeeBadge fee={pool.fee} />
              </td>
              <td className="table-row-cell">
                <span className={`font-mono-nums font-semibold ${
                  pool.volumeToTVL > 5 ? 'text-positive' :
                  pool.volumeToTVL > 2 ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {pool.volumeToTVL.toFixed(2)}x
                </span>
              </td>
              <td className="table-row-cell">
                <span className={`font-mono-nums ${
                  pool.volatility > 8 ? 'text-negative' :
                  pool.volatility > 4 ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {pool.volatility.toFixed(1)}%
                </span>
              </td>
              <td className="table-row-cell">
                <span className={`font-mono-nums font-semibold ${
                  (pool.estimatedAPR ?? 0) > 100 ? 'text-positive' :
                  (pool.estimatedAPR ?? 0) > 50 ? 'text-info' : 'text-muted-foreground'
                }`}>
                  {pool.estimatedAPR !== null ? `${pool.estimatedAPR.toFixed(1)}%*` : 'N/A'}
                </span>
              </td>
              <td className="table-row-cell">
                <ScoreBar score={pool.analyticsScore} />
              </td>
              <td className="table-row-cell">
                <RiskBadge level={pool.riskLevel} />
              </td>
              <td className="table-row-cell">
                <Link
                  href={`/pool-detail?address=${pool.address}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 btn-ghost text-xs px-2 py-1"
                >
                  <Icon name="ArrowTopRightOnSquareIcon" size={14} />
                  Analyze
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground/60 px-3 py-2 border-t border-border">
        * Est. APR based on recent fee activity. Not guaranteed. Past performance does not predict future results.
      </p>
    </div>
  );
}