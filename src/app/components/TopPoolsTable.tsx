'use client';

import React from 'react';
import Link from 'next/link';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import { RiskBadge, FeeBadge } from '@/components/ui/Badge';
import Icon from '@/components/ui/AppIcon';
import { usePoolsData } from '@/hooks/useChainData';

function truncateAddress(address: string) {
  if (!address) return 'N/A';
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export default function TopPoolsTable() {
  const { pools, isLoading, error } = usePoolsData(30_000);
  const sorted = [...pools].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));

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
        <p className="text-xs text-muted-foreground text-center">Unable to retrieve live Robinhood Chain pool data.</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center gap-2">
        <Icon name="Squares2X2Icon" size={20} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">No pools discovered</p>
        <p className="text-xs text-muted-foreground text-center">The Robinhood subgraph returned no DLMM pools.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="table-header-cell">Pool</th>
            <th className="table-header-cell">TVL</th>
            <th className="table-header-cell">Fee</th>
            <th className="table-header-cell">Bin Step</th>
            <th className="table-header-cell">Active Bin</th>
            <th className="table-header-cell">Status</th>
            <th className="table-header-cell">Risk</th>
            <th className="table-header-cell"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pool: LivePool) => (
            <tr key={pool.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100 group">
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
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{pool.pair}</p>
                    <p className="text-xs text-muted-foreground font-mono-nums">{truncateAddress(pool.address)}</p>
                  </div>
                </div>
              </td>
              <td className="table-row-cell text-foreground">{fmtUSD(pool.tvl)}</td>
              <td className="table-row-cell"><FeeBadge fee={pool.fee} /></td>
              <td className="table-row-cell font-mono-nums">{pool.binStep || 'N/A'}</td>
              <td className="table-row-cell font-mono-nums">{pool.activeBin ?? 'N/A'}</td>
              <td className="table-row-cell">
                <span className={`text-xs font-semibold ${pool.status === 'active' ? 'text-positive' : 'text-muted-foreground'}`}>
                  {pool.status.toUpperCase()}
                </span>
              </td>
              <td className="table-row-cell"><RiskBadge level={pool.riskLevel} /></td>
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
    </div>
  );
}
