'use client';

import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { LivePool } from '@/lib/liveTypes';
import { usePoolsData } from '@/hooks/useChainData';

// NewPool type mapped from LivePool for scanner compatibility
type NewPool = LivePool & {
  ageMinutes: number;
  lpStatus: 'locked' | 'unlocked' | 'burned';
  riskScore: number;
  holders: number;
  initialLiquidity: number;
};
import Icon from '@/components/ui/AppIcon';
import { useWallet, LPPosition } from '@/hooks/useWallet';


// ─── Filter State ─────────────────────────────────────────────────────────────
interface ScannerFilters {
  minLiquidity: number;
  minVolume: number;
  minVolToTVL: number;
  maxAgeMinutes: number;
  feeTiers: number[];
  maxRiskScore: number;
  riskLevels: string[];
  lpStatus: string[];
}

const DEFAULT_FILTERS: ScannerFilters = {
  minLiquidity: 0,
  minVolume: 0,
  minVolToTVL: 0,
  maxAgeMinutes: 1440,
  feeTiers: [0.05, 0.1, 0.3, 1.0],
  maxRiskScore: 100,
  riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'],
  lpStatus: ['locked', 'unlocked', 'burned'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function RangeSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-xs font-mono-nums text-foreground font-semibold">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full bg-muted appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-muted-foreground/50 font-mono-nums">{format(min)}</span>
        <span className="text-xs text-muted-foreground/50 font-mono-nums">{format(max)}</span>
      </div>
    </div>
  );
}

// ─── LP Status Badge ──────────────────────────────────────────────────────────
function LpStatusBadge({ status }: { status: NewPool['lpStatus'] }) {
  const styles: Record<string, string> = {
    locked: 'bg-positive-subtle text-positive border-positive/30',
    unlocked: 'bg-warning-subtle text-warning border-warning/30',
    burned: 'bg-muted/60 text-muted-foreground border-border',
  };
  const icons: Record<string, string> = {
    locked: 'LockClosedIcon',
    unlocked: 'LockOpenIcon',
    burned: 'FireIcon',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${styles[status]}`}>
      <Icon name={icons[status] as Parameters<typeof Icon>[0]['name']} size={10} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Risk Score Bar ───────────────────────────────────────────────────────────
function RiskScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-negative' :
    score >= 60 ? 'bg-warning' :
    score >= 40 ? 'bg-info': 'bg-positive';
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-mono-nums font-bold ${
        score >= 80 ? 'text-negative' : score >= 60 ? 'text-warning' : score >= 40 ? 'text-info' : 'text-positive'
      }`}>{score}</span>
    </div>
  );
}

// ─── LP Positions Panel ───────────────────────────────────────────────────────
function InRangeBadge({ inRange }: { inRange: boolean }) {
  return inRange ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-positive-subtle text-positive border border-positive/30">
      <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
      In Range
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-negative-subtle text-negative border border-negative/30">
      <span className="w-1.5 h-1.5 rounded-full bg-negative" />
      Out of Range
    </span>
  );
}

function PnlValue({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={`font-mono-nums font-semibold text-sm ${isPos ? 'text-positive' : 'text-negative'}`}>
      {isPos ? '+' : ''}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function RangeBar({ lower, upper, current }: { lower: number; upper: number; current: number }) {
  const pct = Math.min(100, Math.max(0, ((current - lower) / (upper - lower)) * 100));
  const inRange = current >= lower && current <= upper;
  return (
    <div className="relative w-full h-2 rounded-full bg-muted overflow-visible mt-1">
      <div className={`absolute inset-y-0 left-0 rounded-full ${inRange ? 'bg-positive/30' : 'bg-negative/20'}`} style={{ width: '100%' }} />
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm z-10 ${inRange ? 'bg-positive' : 'bg-negative'}`}
        style={{ left: `calc(${pct}% - 5px)` }}
      />
    </div>
  );
}

function LPPositionCard({ pos }: { pos: LPPosition }) {
  const pnlPct = ((pos.currentValue - pos.capital) / pos.capital) * 100;
  const ilColor = pos.ilVsHodl < -5 ? 'text-negative' : pos.ilVsHodl < -2 ? 'text-warning' : 'text-positive';

  function fmtPrice(p: number) {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(8)}`;
  }

  return (
    <div className={`rounded-xl border bg-card p-4 space-y-3 transition-all duration-200 hover:shadow-md ${pos.inRange ? 'border-positive/20' : 'border-negative/20'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            <div className="w-7 h-7 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-bold text-primary">
              {pos.tokenA[0]}
            </div>
            <div className="w-7 h-7 rounded-full bg-accent/20 border-2 border-background flex items-center justify-center text-xs font-bold text-accent">
              {pos.tokenB[0]}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{pos.pair}</p>
            <p className="text-xs text-muted-foreground font-mono-nums">{pos.fee}% fee</p>
          </div>
        </div>
        <InRangeBadge inRange={pos.inRange} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <div>
          <p className="data-label mb-0.5">Capital</p>
          <p className="text-sm font-mono-nums font-semibold text-foreground">
            ${pos.capital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="data-label mb-0.5">Current Value</p>
          <p className="text-sm font-mono-nums font-semibold text-foreground">
            ${pos.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="data-label mb-0.5">PnL</p>
          <div className="flex items-center gap-1.5">
            <PnlValue value={pos.pnl} />
            <span className={`text-xs font-mono-nums ${pnlPct >= 0 ? 'text-positive' : 'text-negative'}`}>
              ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div>
          <p className="data-label mb-0.5">Fees Earned</p>
          <p className="text-sm font-mono-nums font-semibold text-positive">
            +${pos.feesEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="data-label mb-0.5">IL vs HODL</p>
          <p className={`text-sm font-mono-nums font-semibold ${ilColor}`}>
            {pos.ilVsHodl >= 0 ? '+' : ''}{pos.ilVsHodl.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="data-label mb-0.5">Current Price</p>
          <p className="text-sm font-mono-nums font-semibold text-foreground">{fmtPrice(pos.currentPrice)}</p>
        </div>
      </div>

      {/* Range visualization */}
      <div className="pt-1 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono-nums text-muted-foreground">
          <span>{fmtPrice(pos.rangeLower)}</span>
          <span className="text-foreground/60 text-xs">Range</span>
          <span>{fmtPrice(pos.rangeUpper)}</span>
        </div>
        <RangeBar lower={pos.rangeLower} upper={pos.rangeUpper} current={pos.currentPrice} />
        <div className="flex items-center justify-between text-xs font-mono-nums mt-1">
          <span className={`${pos.distToLower < 0 ? 'text-negative' : 'text-muted-foreground'}`}>
            ↓ {Math.abs(pos.distToLower).toFixed(1)}% to lower
          </span>
          <span className={`${pos.distToUpper < 0 ? 'text-negative' : 'text-muted-foreground'}`}>
            {Math.abs(pos.distToUpper).toFixed(1)}% to upper ↑
          </span>
        </div>
      </div>
    </div>
  );
}

function LPPositionsPanel() {
  const { isConnected, lpPositions, isLoadingBalances, account } = useWallet();

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-muted/60 flex items-center justify-center">
          <Icon name="WalletIcon" size={22} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Connect Wallet to View Positions</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your LP positions will appear here once connected</p>
        </div>
      </div>
    );
  }

  if (isLoadingBalances) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading positions…</p>
      </div>
    );
  }

  const totalCapital = lpPositions.reduce((s, p) => s + p.capital, 0);
  const totalValue = lpPositions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = lpPositions.reduce((s, p) => s + p.pnl, 0);
  const totalFees = lpPositions.reduce((s, p) => s + p.feesEarned, 0);
  const inRangeCount = lpPositions.filter((p) => p.inRange).length;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon name="ChartBarIcon" size={16} className="text-primary" />
          <h2 className="text-base font-bold text-foreground">My LP Positions</h2>
          <span className="text-xs font-mono-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
            {lpPositions.length} position{lpPositions.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-mono-nums text-positive bg-positive-subtle border border-positive/30 px-2 py-0.5 rounded-md">
            {inRangeCount}/{lpPositions.length} in range
          </span>
        </div>
        <p className="text-xs text-muted-foreground font-mono-nums truncate max-w-[180px]">
          {account?.slice(0, 6)}…{account?.slice(-4)}
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Capital', value: `$${totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: 'BanknotesIcon', color: 'text-info' },
          { label: 'Current Value', value: `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: 'CurrencyDollarIcon', color: 'text-foreground' },
          { label: 'Total PnL', value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: 'ArrowTrendingUpIcon', color: totalPnl >= 0 ? 'text-positive' : 'text-negative' },
          { label: 'Fees Earned', value: `+$${totalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: 'SparklesIcon', color: 'text-positive' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name={s.icon as Parameters<typeof Icon>[0]['name']} size={13} className={s.color} />
              <p className="data-label">{s.label}</p>
            </div>
            <p className={`text-lg font-bold font-mono-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Position cards */}
      {lpPositions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
          <Icon name="InboxIcon" size={24} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No LP positions found</p>
          <p className="text-xs text-muted-foreground">Provide liquidity to a pool to see your positions here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {lpPositions.map((pos) => (
            <LPPositionCard key={pos.poolAddress} pos={pos} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ScannerPage() {
  const [filters, setFilters] = useState<ScannerFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof NewPool>('ageMinutes');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(true);

  // Live pool data from indexer
  const { pools: livePools, isLoading, error } = usePoolsData(30_000);

  // Map live pools to NewPool format
  const newPools: NewPool[] = useMemo(() => {
    return livePools.map((p, idx) => ({
      ...p,
      ageMinutes: p.createdAt
        ? Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000)
        : (idx + 1) * 30,
      lpStatus: 'unlocked' as const,
      riskScore: 100 - p.analyticsScore,
      holders: p.swapCount24h,
      initialLiquidity: p.tvl ?? 0,
    }));
  }, [livePools]);

  const FEE_TIERS = [0.05, 0.1, 0.3, 1.0];
  const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];
  const LP_STATUSES = ['locked', 'unlocked', 'burned'];

  const toggleFee = (fee: number) => {
    const next = filters.feeTiers.includes(fee)
      ? filters.feeTiers.filter((f) => f !== fee)
      : [...filters.feeTiers, fee];
    setFilters({ ...filters, feeTiers: next });
  };

  const toggleRisk = (risk: string) => {
    const next = filters.riskLevels.includes(risk)
      ? filters.riskLevels.filter((r) => r !== risk)
      : [...filters.riskLevels, risk];
    setFilters({ ...filters, riskLevels: next });
  };

  const toggleLpStatus = (status: string) => {
    const next = filters.lpStatus.includes(status)
      ? filters.lpStatus.filter((s) => s !== status)
      : [...filters.lpStatus, status];
    setFilters({ ...filters, lpStatus: next });
  };

  const handleSort = (key: keyof NewPool) => {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    return newPools.filter((p) => {
      if ((p.tvl ?? 0) < filters.minLiquidity) return false;
      if ((p.volume24h ?? 0) < filters.minVolume) return false;
      if (p.volumeToTVL < filters.minVolToTVL) return false;
      if (p.ageMinutes > filters.maxAgeMinutes) return false;
      if (!filters.feeTiers.includes(p.fee)) return false;
      if (p.riskScore > filters.maxRiskScore) return false;
      if (!filters.riskLevels.includes(p.riskLevel)) return false;
      if (!filters.lpStatus.includes(p.lpStatus)) return false;
      if (search && !p.pair.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [newPools, filters, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: keyof NewPool }) => {
    if (sortKey !== k) return <Icon name="ChevronUpDownIcon" size={11} className="text-muted-foreground/40" />;
    return sortDir === 'desc'
      ? <Icon name="ChevronDownIcon" size={11} className="text-primary" />
      : <Icon name="ChevronUpIcon" size={11} className="text-primary" />;
  };

  const riskColor: Record<string, string> = {
    LOW: 'text-positive border-positive/40 bg-positive-subtle',
    MEDIUM: 'text-warning border-warning/40 bg-warning-subtle',
    HIGH: 'text-negative border-negative/40 bg-negative-subtle',
    EXTREME: 'text-negative border-negative/40 bg-negative-subtle',
  };

  const avgRisk = filtered.length
    ? Math.round(filtered.reduce((a, b) => a + b.riskScore, 0) / filtered.length)
    : 0;

  const newestPool = filtered.length
    ? Math.min(...filtered.map((p) => p.ageMinutes))
    : 0;

  return (
    <AppLayout>
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-2xl font-bold text-foreground">New Pool Scanner</h1>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-muted/40 text-muted-foreground border border-border">
                Indexer Required
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Discover newly created pools on Robinhood Chain — sorted by age, filtered by risk
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search pair..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-8 w-48 text-sm h-9"
                suppressHydrationWarning
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                showFilters
                  ? 'bg-primary/10 text-primary border-primary/30' :'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/40'
              }`}
              suppressHydrationWarning
            >
              <Icon name="FunnelIcon" size={14} />
              Filters
            </button>
          </div>
        </div>

        {/* LP Positions Panel */}
        <LPPositionsPanel />

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'New Pools (24h)',
              value: isLoading ? '…' : newPools.length > 0 ? newPools.length.toString() : 'N/A',
              sub: 'Robinhood Chain',
              icon: 'SparklesIcon',
              color: 'text-primary',
            },
            {
              label: 'Matching Filters',
              value: filtered.length.toString(),
              sub: 'Current criteria',
              icon: 'FunnelIcon',
              color: 'text-info',
            },
            {
              label: 'Newest Pool',
              value: filtered.length ? formatAge(newestPool) : '—',
              sub: 'Most recent',
              icon: 'ClockIcon',
              color: 'text-positive',
            },
            {
              label: 'Avg Risk Score',
              value: filtered.length ? avgRisk.toString() : '—',
              sub: 'Lower = safer',
              icon: 'ShieldExclamationIcon',
              color: avgRisk >= 70 ? 'text-negative' : avgRisk >= 40 ? 'text-warning' : 'text-positive',
            },
          ].map((stat) => (
            <div key={`stat-${stat.label}`} className="rounded-xl border border-border bg-card p-3 card-hover">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon name={stat.icon as Parameters<typeof Icon>[0]['name']} size={13} className={stat.color} />
                <p className="data-label">{stat.label}</p>
              </div>
              <p className="text-xl font-bold font-mono-nums text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Main layout */}
        <div className="flex gap-5 items-start">
          {/* Filter Sidebar */}
          {showFilters && (
            <div className="w-60 flex-shrink-0 rounded-xl border border-border bg-card p-4 space-y-5 self-start sticky top-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Filters</h3>
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  suppressHydrationWarning
                >
                  <Icon name="ArrowPathIcon" size={12} />
                  Reset
                </button>
              </div>

              {/* Min Liquidity */}
              <div className="space-y-3">
                <p className="data-label">Liquidity</p>
                <RangeSlider
                  label="Min Liquidity (TVL)"
                  value={filters.minLiquidity}
                  min={0}
                  max={5_000_000}
                  step={10_000}
                  format={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`}
                  onChange={(v) => setFilters({ ...filters, minLiquidity: v })}
                />
              </div>

              {/* Min Volume */}
              <div className="space-y-3">
                <p className="data-label">Volume</p>
                <RangeSlider
                  label="Min 24h Volume"
                  value={filters.minVolume}
                  min={0}
                  max={10_000_000}
                  step={50_000}
                  format={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`}
                  onChange={(v) => setFilters({ ...filters, minVolume: v })}
                />
                <RangeSlider
                  label="Min Vol/TVL"
                  value={filters.minVolToTVL}
                  min={0}
                  max={20}
                  step={0.5}
                  format={(v) => `${v.toFixed(1)}x`}
                  onChange={(v) => setFilters({ ...filters, minVolToTVL: v })}
                />
              </div>

              {/* Token Age */}
              <div className="space-y-3">
                <p className="data-label">Token Age</p>
                <RangeSlider
                  label="Max Age"
                  value={filters.maxAgeMinutes}
                  min={30}
                  max={1440}
                  step={30}
                  format={(v) => formatAge(v)}
                  onChange={(v) => setFilters({ ...filters, maxAgeMinutes: v })}
                />
              </div>

              {/* Risk Score */}
              <div className="space-y-3">
                <p className="data-label">Risk Score</p>
                <RangeSlider
                  label="Max Risk Score"
                  value={filters.maxRiskScore}
                  min={0}
                  max={100}
                  step={5}
                  format={(v) => `${v}`}
                  onChange={(v) => setFilters({ ...filters, maxRiskScore: v })}
                />
              </div>

              {/* Fee Tiers */}
              <div>
                <p className="data-label mb-2">Fee Tier</p>
                <div className="flex flex-wrap gap-2">
                  {FEE_TIERS.map((fee) => (
                    <button
                      key={`fee-${fee}`}
                      onClick={() => toggleFee(fee)}
                      suppressHydrationWarning
                      className={`px-2.5 py-1 rounded-md text-xs font-mono-nums font-semibold border transition-all duration-150 ${
                        filters.feeTiers.includes(fee)
                          ? 'bg-info-subtle text-info border-info/40' :'bg-muted/40 text-muted-foreground border-border hover:border-border/80'
                      }`}
                    >
                      {fee}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk Levels */}
              <div>
                <p className="data-label mb-2">Risk Level</p>
                <div className="space-y-1.5">
                  {RISK_LEVELS.map((risk) => (
                    <button
                      key={`risk-${risk}`}
                      onClick={() => toggleRisk(risk)}
                      suppressHydrationWarning
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                        filters.riskLevels.includes(risk)
                          ? riskColor[risk]
                          : 'bg-muted/20 text-muted-foreground border-border/50 hover:bg-muted/40'
                      }`}
                    >
                      {risk}
                      {filters.riskLevels.includes(risk) && <Icon name="CheckIcon" size={12} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* LP Status */}
              <div>
                <p className="data-label mb-2">LP Status</p>
                <div className="space-y-1.5">
                  {LP_STATUSES.map((status) => (
                    <button
                      key={`lp-${status}`}
                      onClick={() => toggleLpStatus(status)}
                      suppressHydrationWarning
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                        filters.lpStatus.includes(status)
                          ? 'bg-primary/10 text-primary border-primary/30' :'bg-muted/20 text-muted-foreground border-border/50 hover:bg-muted/40'
                      }`}
                    >
                      <span className="capitalize">{status}</span>
                      {filters.lpStatus.includes(status) && <Icon name="CheckIcon" size={12} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="live-dot" />
                  <h2 className="text-sm font-semibold text-foreground">Newly Created Pools</h2>
                  <span className="text-xs font-mono-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    {filtered.length} / {newPools.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sorted by: <span className="text-foreground font-medium">{String(sortKey)}</span>
                </p>
              </div>

              {sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center mb-3">
                    <Icon name="FunnelIcon" size={22} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No pools match your filters</p>
                  <p className="text-xs text-muted-foreground mt-1">Try loosening the filter constraints</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="table-header-cell">#</th>
                        <th className="table-header-cell">Pool</th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('ageMinutes')}>
                          <span className="flex items-center gap-1">Age <SortIcon k="ageMinutes" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('tvl')}>
                          <span className="flex items-center gap-1">Liquidity <SortIcon k="tvl" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('volume5m')}>
                          <span className="flex items-center gap-1">5m Vol <SortIcon k="volume5m" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('volume1h')}>
                          <span className="flex items-center gap-1">1h Vol <SortIcon k="volume1h" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('volume24h')}>
                          <span className="flex items-center gap-1">24h Vol <SortIcon k="volume24h" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('volumeToTVL')}>
                          <span className="flex items-center gap-1">Vol/TVL <SortIcon k="volumeToTVL" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('swapCount')}>
                          <span className="flex items-center gap-1">Swaps <SortIcon k="swapCount" /></span>
                        </th>
                        <th className="table-header-cell">LP Status</th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('riskScore')}>
                          <span className="flex items-center gap-1">Risk <SortIcon k="riskScore" /></span>
                        </th>
                        <th className="table-header-cell cursor-pointer" onClick={() => handleSort('priceChange1h')}>
                          <span className="flex items-center gap-1">1h Δ <SortIcon k="priceChange1h" /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((pool, idx) => (
                        <tr
                          key={pool.id}
                          className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100 group"
                        >
                          <td className="table-row-cell text-muted-foreground font-mono-nums text-xs">{idx + 1}</td>
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
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-semibold text-foreground">{pool.pair}</p>
                                  {pool.isVerified && (
                                    <Icon name="CheckBadgeIcon" size={13} className="text-info" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono-nums">
                                  {pool.fee}% · Step {pool.binStep}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="table-row-cell">
                            <span className={`text-xs font-mono-nums font-semibold px-2 py-0.5 rounded-md ${
                              pool.ageMinutes < 60
                                ? 'bg-positive-subtle text-positive'
                                : pool.ageMinutes < 180
                                ? 'bg-info-subtle text-info' :'bg-muted/60 text-muted-foreground'
                            }`}>
                              {formatAge(pool.ageMinutes)}
                            </span>
                          </td>
                          <td className="table-row-cell font-mono-nums text-foreground text-sm">
                            {formatUSD(pool.tvl)}
                          </td>
                          <td className="table-row-cell font-mono-nums text-muted-foreground text-xs">
                            {formatUSD(pool.volume5m)}
                          </td>
                          <td className="table-row-cell font-mono-nums text-foreground text-sm">
                            {formatUSD(pool.volume1h)}
                          </td>
                          <td className="table-row-cell">
                            <span className={`font-mono-nums font-semibold text-sm ${
                              pool.volume24h > pool.tvl ? 'text-positive' : 'text-foreground'
                            }`}>
                              {formatUSD(pool.volume24h)}
                            </span>
                          </td>
                          <td className="table-row-cell">
                            <span className={`font-mono-nums font-semibold text-sm ${
                              pool.volumeToTVL > 10 ? 'text-positive' :
                              pool.volumeToTVL > 4 ? 'text-info': 'text-muted-foreground'
                            }`}>
                              {pool.volumeToTVL.toFixed(2)}x
                            </span>
                          </td>
                          <td className="table-row-cell font-mono-nums text-muted-foreground text-xs">
                            {pool.swapCount.toLocaleString()}
                          </td>
                          <td className="table-row-cell">
                            <LpStatusBadge status={pool.lpStatus} />
                          </td>
                          <td className="table-row-cell">
                            <RiskScoreBar score={pool.riskScore} />
                          </td>
                          <td className="table-row-cell">
                            <span className={`font-mono-nums font-semibold text-sm ${
                              pool.priceChange1h > 0 ? 'text-positive' : 'text-negative'
                            }`}>
                              {pool.priceChange1h > 0 ? '+' : ''}{pool.priceChange1h.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                    <p className="text-xs text-muted-foreground/60">
                      Pool age, risk score, and LP status are for informational purposes only. Not investment advice.
                    </p>
                    <p className="text-xs text-muted-foreground font-mono-nums">
                      {filtered.length} pool{filtered.length !== 1 ? 's' : ''} shown
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Risk Warning */}
            <div className="rounded-xl border border-negative/20 bg-negative-subtle p-3">
              <div className="flex items-start gap-2">
                <Icon name="ExclamationTriangleIcon" size={14} className="text-negative mt-0.5 flex-shrink-0" />
                <p className="text-xs text-negative/80">
                  <span className="font-semibold text-negative">New Pool Risk Warning:</span>{' '}
                  Newly created pools carry significantly higher risk. Unlocked or burned LP may indicate rug pull potential.
                  High Vol/TVL on new pools can be caused by wash trading or bot activity. Always verify token contracts independently.
                  This data is for informational purposes only and is not financial advice.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
