'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LivePool, fmtUSD } from '@/lib/liveTypes';
import Icon from '@/components/ui/AppIcon';

type SortKey = 'analyticsScore' | 'tvl' | 'volume24h' | 'volumeToTVL' | 'swapCount24h' | 'createdAt';

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  '0x6245e67affa44a23077f0ea7f981a8dc743a0c47': 'FRONG',
  '0x0bd7d308f8e1639fab988df18a8011f41eacad73': 'WETH',
  '0x5fc5360d0400a0fd4f2af552add042d716f1d168': 'USDG',
};

function getSortValue(pool: LivePool, key: SortKey): number {
  if (key === 'analyticsScore') return pool.analyticsScore ?? -1;
  if (key === 'tvl') return pool.tvl ?? -1;
  if (key === 'volume24h') return pool.volume24h ?? -1;
  if (key === 'volumeToTVL') return pool.volumeToTVL ?? -1;
  if (key === 'swapCount24h') return pool.swapCount24h ?? -1;
  return pool.createdAt ? Date.parse(pool.createdAt) : -1;
}

function shortAddress(value: string | null | undefined) {
  if (!value) return 'N/A';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function scoreClass(score: number | null) {
  if (score === null) return 'bg-muted text-muted-foreground';
  if (score >= 75) return 'bg-positive-subtle text-positive';
  if (score >= 50) return 'bg-warning-subtle text-warning';
  return 'bg-negative-subtle text-negative';
}

function tokenLabel(address: string | null | undefined, fallback: string | null | undefined) {
  if (address) {
    const known = KNOWN_TOKEN_NAMES[address.toLowerCase()];
    if (known) return known;
  }
  return fallback || (address ? shortAddress(address) : null);
}

function displayPair(pool: LivePool) {
  const a = tokenLabel(pool.tokenAAddress, pool.tokenAName || pool.tokenA);
  const b = tokenLabel(pool.tokenBAddress, pool.tokenBName || pool.tokenB);
  return a && b ? `${a} / ${b}` : pool.pair || 'Unknown Pool';
}

export default function ScannerTable({ pools, onSelect, selectedId }: { pools: LivePool[]; onSelect: (pool: LivePool) => void; selectedId?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('analyticsScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); else { setSortKey(key); setSortDir('desc'); } };
  const sorted = [...pools].sort((a, b) => { const av = getSortValue(a, sortKey); const bv = getSortValue(b, sortKey); return sortDir === 'desc' ? bv - av : av - bv; });
  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? <Icon name="ChevronUpDownIcon" size={11} className="text-muted-foreground/40" /> : sortDir === 'desc' ? <Icon name="ChevronDownIcon" size={11} className="text-primary" /> : <Icon name="ChevronUpIcon" size={11} className="text-primary" />;
  const headers: { label: string; key: SortKey }[] = [
    { label: 'Score', key: 'analyticsScore' }, { label: 'TVL', key: 'tvl' }, { label: '24h Vol', key: 'volume24h' }, { label: 'Vol/TVL', key: 'volumeToTVL' }, { label: 'Swaps 24h', key: 'swapCount24h' }, { label: 'Created', key: 'createdAt' },
  ];

  if (!pools.length) return <div className="flex flex-col items-center justify-center py-16 text-center"><Icon name="FunnelIcon" size={22} className="text-muted-foreground mb-3" /><p className="text-sm font-semibold">No pools match your live filters</p><p className="text-xs text-muted-foreground mt-1">Try lowering the score or liquidity thresholds.</p></div>;

  return <div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr className="border-b border-border"><th className="table-header-cell">#</th><th className="table-header-cell">Pool / Token</th>{headers.map((h) => <th key={h.key} className="table-header-cell cursor-pointer" onClick={() => handleSort(h.key)}><span className="flex items-center gap-1">{h.label}<SortIcon k={h.key} /></span></th>)}<th className="table-header-cell">GMGN Liq.</th><th className="table-header-cell">Holders</th><th className="table-header-cell">Price</th><th className="table-header-cell">Bin Step</th><th className="table-header-cell">Status</th><th className="table-header-cell">Action</th></tr></thead><tbody>{sorted.map((pool, idx) => {
    const tokenName = pool.gmgn?.name || pool.tokenAName || pool.tokenBName;
    const tokenSymbol = pool.gmgn?.symbol || pool.tokenA || pool.tokenB;
    const pairLabel = displayPair(pool);
    const detailHref = `/pool-detail?address=${encodeURIComponent(pool.address)}`;
    return <tr key={pool.id} onClick={() => onSelect(pool)} className={`border-b border-border/50 cursor-pointer transition-colors group ${selectedId === pool.id ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/30'}`}>
      <td className="table-row-cell text-muted-foreground font-mono-nums text-xs">{idx + 1}</td>
      <td className="table-row-cell min-w-[220px]"><Link href={detailHref} onClick={(e) => e.stopPropagation()} className="block group/pool"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold text-foreground group-hover/pool:text-primary transition-colors">{pairLabel}</p>{pool.gmgn && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-positive-subtle text-positive">GMGN</span>}</div><p className="text-xs text-muted-foreground mt-0.5">{tokenName || 'Token metadata unavailable'}{tokenSymbol ? ` · ${tokenSymbol}` : ''}</p><p className="text-[11px] text-muted-foreground/60 mt-0.5">{pool.protocol} · {shortAddress(pool.address)}</p></div></Link></td>
      <td className="table-row-cell"><span className={`inline-flex min-w-10 justify-center px-2 py-0.5 rounded-md text-xs font-bold font-mono-nums ${scoreClass(pool.analyticsScore)}`}>{pool.analyticsScore === null ? 'N/A' : pool.analyticsScore}</span></td>
      <td className="table-row-cell font-mono-nums text-foreground">{fmtUSD(pool.tvl)}</td>
      <td className="table-row-cell font-mono-nums font-semibold">{fmtUSD(pool.volume24h)}</td>
      <td className="table-row-cell font-mono-nums">{pool.volumeToTVL === null ? 'N/A' : `${pool.volumeToTVL.toFixed(2)}x`}</td>
      <td className="table-row-cell font-mono-nums">{pool.swapCount24h === null ? 'N/A' : pool.swapCount24h.toLocaleString()}</td>
      <td className="table-row-cell text-xs text-muted-foreground">{pool.createdAt ? new Date(pool.createdAt).toLocaleDateString() : 'N/A'}</td>
      <td className="table-row-cell font-mono-nums">{fmtUSD(pool.gmgn?.liquidityUsd)}</td>
      <td className="table-row-cell font-mono-nums">{pool.gmgn?.holderCount === null || pool.gmgn?.holderCount === undefined ? 'N/A' : pool.gmgn.holderCount.toLocaleString()}</td>
      <td className="table-row-cell font-mono-nums">{pool.currentPrice === null ? (pool.gmgn?.priceUsd !== null && pool.gmgn?.priceUsd !== undefined ? pool.gmgn.priceUsd.toPrecision(6) : 'N/A') : pool.currentPrice.toFixed(8)}</td>
      <td className="table-row-cell font-mono-nums">{pool.binStep === null ? 'N/A' : pool.binStep}</td>
      <td className="table-row-cell"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${pool.status === 'active' ? 'bg-positive-subtle text-positive' : 'bg-muted text-muted-foreground'}`}>{pool.status}</span></td>
      <td className="table-row-cell"><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100"><button onClick={(e) => { e.stopPropagation(); onSelect(pool); }} className="btn-ghost text-xs px-2 py-1" title="Inspect live data"><Icon name="ChartBarIcon" size={13} /></button><Link href={detailHref} onClick={(e) => e.stopPropagation()} className="btn-ghost text-xs px-2 py-1" title="Open pool detail"><Icon name="ArrowTopRightOnSquareIcon" size={13} /></Link></div></td>
    </tr>;
  })}</tbody></table><div className="flex items-center justify-between px-3 py-2 border-t border-border"><p className="text-xs text-muted-foreground/60">Click a pool name to open its live detail page. Click elsewhere in a row to inspect it inline.</p><p className="text-xs text-muted-foreground font-mono-nums">{pools.length} pool{pools.length !== 1 ? 's' : ''}</p></div></div>;
}
