'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge, FeeBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import { usePoolsData } from '@/hooks/useChainData';

type SortKey = 'tvl' | 'volume24h' | 'fee' | 'volumeToTVL' | 'volatility' | 'estimatedAPR' | 'analyticsScore';

// Liquidity sanity guard: very small pools can produce misleadingly large
// Vol/TVL ratios. Keep those pools out of the opportunity ranking rather than
// letting a tiny denominator dominate the score.
const MIN_RANKING_TVL_USD = 1_000;
const THIN_LIQUIDITY_TVL_USD = 5_000;

function liquidityAdjustedScore(pool: LivePool): number {
  const score = pool.analyticsScore ?? 0;
  const tvl = pool.tvl ?? 0;
  if (tvl < MIN_RANKING_TVL_USD) return 0;
  if (tvl < THIN_LIQUIDITY_TVL_USD) return Math.min(score, 59);
  return score;
}

function liquidityLabel(pool: LivePool): string | null {
  const tvl = pool.tvl ?? 0;
  if (tvl < MIN_RANKING_TVL_USD) return 'Excluded: TVL < $1K';
  if (tvl < THIN_LIQUIDITY_TVL_USD) return 'Thin liquidity';
  return null;
}

function ScoreBar({ score, liquidityNote }: { score: number; liquidityNote?: string | null }) {
  const color =
    score >= 80 ? 'bg-positive' : score >= 60 ? 'bg-warning' : 'bg-negative';
  return (
    <div className="flex flex-col gap-1">
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
      {liquidityNote && (
        <span className="text-[10px] text-warning/80 whitespace-nowrap">{liquidityNote}</span>
      )}
    </div>
  );
}

function getSortValue(pool: LivePool, key: SortKey): number {
  switch (key) {
    case 'tvl': return pool.tvl ?? 0;
    case 'volume24h': return pool.volume24h ?? 0;
    case 'fee': return pool.fee ?? 0;
    case 'volumeToTVL': return pool.volumeToTVL ?? 0;
    case 'volatility': return pool.volatility ?? 0;
    case 'estimatedAPR': return pool.estimatedAPR ?? 0;
    case 'analyticsScore': return liquidityAdjustedScore(pool);
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

  // Hard-exclude sub-$1K pools from the opportunity ranking. They remain
  // visible when the table is sorted by another metric, so the scanner does
  // not hide live data; they simply cannot rank as an opportunity.
  const sorted = [...pools].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    if (sortKey === 'analyticsScore') {
      const aEligible = (a.tvl ?? 0) >= MIN_RANKING_TVL_USD;
      const bEligible = (b.tvl ?? 0) >= MIN_RANKING_TVL_USD;
      if (aEligible !== bEligible) return aEligible ? -1 : 1;
    }
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
          {sorted.map((pool) => {
            const score = liquidityAdjustedScore(pool);
            const liquidityNote = liquidityLabel(pool);
            return (
              <tr
                key={pool.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100 group"
              >
                <td className="table-row-cell">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      <div className="w-6 h-6 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xs font-bold text-primary">
                        {pool.tokenA?.[0] ?? '?'}
                      </div>
                      <div className="w-6 h-6 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent">
                        {pool.tokenB?.[0] ?? '?'}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{pool.pair}</p>
                      <p className="text-xs text-muted-foreground">Step {pool.binStep ?? 'N/A'}</p>
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
                  <FeeBadge fee={pool.fee ?? 0} />
                </td>
                <td className="table-row-cell">
                  <span className={`font-mono-nums font-semibold ${
                    (pool.volumeToTVL ?? 0) > 5 ? 'text-positive' :
                    (pool.volumeToTVL ?? 0) > 2 ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {pool.volumeToTVL !== null ? `${pool.volumeToTVL.toFixed(2)}x` : 'N/A'}
                  </span>
                </td>
                <td className="table-row-cell">
                  <span className={`font-mono-nums ${
                    (pool.volatility ?? 0) > 8 ? 'text-negative' :
                    (pool.volatility ?? 0) > 4 ? 'text-warning' : 'text-muted-foreground'
                  }`}>
                    {pool.volatility !== null ? `${pool.volatility.toFixed(1)}%` : 'N/A'}
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
                  <ScoreBar score={score} liquidityNote={liquidityNote} />
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
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-border space-y-1">
        <p className="text-xs text-muted-foreground/60">
          * Est. APR based on recent fee activity. Not guaranteed. Past performance does not predict future results.
        </p>
        <p className="text-[10px] text-muted-foreground/50">
          Liquidity sanity filter: pools below $1K TVL cannot rank as opportunities; pools below $5K are capped at score 59.
        </p>
      </div>
    </div>
  );
}