'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import Icon from '@/components/ui/AppIcon';

type SortKey = 'tvl' | 'volume24h' | 'volumeToTVL' | 'swapCount24h' | 'createdAt';

function getSortValue(pool: LivePool, key: SortKey): number {
  if (key === 'tvl') return pool.tvl ?? -1;
  if (key === 'volume24h') return pool.volume24h ?? -1;
  if (key === 'volumeToTVL') return pool.volumeToTVL ?? -1;
  if (key === 'swapCount24h') return pool.swapCount24h ?? -1;
  return pool.createdAt ? Date.parse(pool.createdAt) : -1;
}

export default function ScannerTable({ pools, onSelect, selectedId }: { pools: LivePool[]; onSelect: (pool: LivePool) => void; selectedId?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('volume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); else { setSortKey(key); setSortDir('desc'); } };
  const sorted = [...pools].sort((a, b) => { const av = getSortValue(a, sortKey); const bv = getSortValue(b, sortKey); return sortDir === 'desc' ? bv - av : av - bv; });
  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? <Icon name="ChevronUpDownIcon" size={11} className="text-muted-foreground/40" /> : sortDir === 'desc' ? <Icon name="ChevronDownIcon" size={11} className="text-primary" /> : <Icon name="ChevronUpIcon" size={11} className="text-primary" />;
  const headers: { label: string; key: SortKey }[] = [
    { label: 'TVL', key: 'tvl' }, { label: '24h Vol', key: 'volume24h' }, { label: 'Vol/TVL', key: 'volumeToTVL' }, { label: 'Swaps 24h', key: 'swapCount24h' }, { label: 'Created', key: 'createdAt' },
  ];

  if (!pools.length) return <div className="flex flex-col items-center justify-center py-16 text-center"><Icon name="FunnelIcon" size={22} className="text-muted-foreground mb-3" /><p className="text-sm font-semibold">No pools match your live filters</p><p className="text-xs text-muted-foreground mt-1">Try loosening the criteria.</p></div>;

  return <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr className="border-b border-border"><th className="table-header-cell">#</th><th className="table-header-cell">Pool</th>{headers.map((h) => <th key={h.key} className="table-header-cell cursor-pointer" onClick={() => handleSort(h.key)}><span className="flex items-center gap-1">{h.label}<SortIcon k={h.key} /></span></th>)}<th className="table-header-cell">Price</th><th className="table-header-cell">Bin Step</th><th className="table-header-cell">Status</th><th className="table-header-cell">Action</th></tr></thead><tbody>{sorted.map((pool, idx) => <tr key={pool.id} onClick={() => onSelect(pool)} className={`border-b border-border/50 cursor-pointer transition-colors group ${selectedId === pool.id ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/30'}`}>
    <td className="table-row-cell text-muted-foreground font-mono-nums text-xs">{idx + 1}</td>
    <td className="table-row-cell"><div><p className="text-sm font-semibold text-foreground">{pool.pair}</p><p className="text-xs text-muted-foreground">{pool.protocol} · {pool.address.slice(0, 6)}…{pool.address.slice(-4)}</p></div></td>
    <td className="table-row-cell font-mono-nums text-foreground">{fmtUSD(pool.tvl)}</td>
    <td className="table-row-cell font-mono-nums font-semibold">{fmtUSD(pool.volume24h)}</td>
    <td className="table-row-cell font-mono-nums">{pool.volumeToTVL === null ? 'N/A' : `${pool.volumeToTVL.toFixed(2)}x`}</td>
    <td className="table-row-cell font-mono-nums">{pool.swapCount24h === null ? 'N/A' : pool.swapCount24h.toLocaleString()}</td>
    <td className="table-row-cell text-xs text-muted-foreground">{pool.createdAt ? new Date(pool.createdAt).toLocaleDateString() : 'N/A'}</td>
    <td className="table-row-cell font-mono-nums">{pool.currentPrice === null ? 'N/A' : pool.currentPrice.toFixed(8)}</td>
    <td className="table-row-cell font-mono-nums">{pool.binStep === null ? 'N/A' : pool.binStep}</td>
    <td className="table-row-cell"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${pool.status === 'active' ? 'bg-positive-subtle text-positive' : 'bg-muted text-muted-foreground'}`}>{pool.status}</span></td>
    <td className="table-row-cell"><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100"><button onClick={(e) => { e.stopPropagation(); onSelect(pool); }} className="btn-ghost text-xs px-2 py-1" title="Inspect live data"><Icon name="ChartBarIcon" size={13} /></button><Link href={`/pool-detail?address=${pool.address}`} onClick={(e) => e.stopPropagation()} className="btn-ghost text-xs px-2 py-1" title="Open pool detail"><Icon name="ArrowTopRightOnSquareIcon" size={13} /></Link></div></td>
  </tr>)}</tbody></table><div className="flex items-center justify-between px-3 py-2 border-t border-border"><p className="text-xs text-muted-foreground/60">All displayed metrics come from live RPC/subgraph responses. No score, APR or risk estimate is substituted.</p><p className="text-xs text-muted-foreground font-mono-nums">{pools.length} pool{pools.length !== 1 ? 's' : ''}</p></div></div>;
}
