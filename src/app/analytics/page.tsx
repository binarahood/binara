'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useWallet } from '@/hooks/useWallet';
import Icon from '@/components/ui/AppIcon';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number, decimals = 2) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}K`;
  return `${n < 0 ? '-$' : '$'}${abs.toFixed(decimals)}`;
}

function fmtPct(n: number, showSign = true) {
  const sign = showSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

// ─── Historical data requires indexer — not available yet ─────────────────────
// PNL_HISTORY and FEES_HISTORY are removed — real data requires subgraph integration

interface Transaction {
  id: string;
  pair: string;
  fee: number;
  type: 'open' | 'close' | 'rebalance';
  entryDate: string;
  exitDate: string | null;
  entryCapital: number;
  exitValue: number | null;
  pnl: number | null;
  feesEarned: number;
  status: 'active' | 'closed';
}

// ─── Time Range Filter ────────────────────────────────────────────────────────
type TimeRange = '1W' | '1M' | '3M' | 'ALL';

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
interface PnlTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

function PnlTooltip({ active, payload, label }: PnlTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const isPos = val >= 0;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm font-bold font-mono-nums ${isPos ? 'text-positive' : 'text-negative'}`}>
        {isPos ? '+' : ''}{fmt$(val)}
      </p>
    </div>
  );
}

interface FeesTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function FeesTooltip({ active, payload, label }: FeesTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold font-mono-nums text-positive">{fmt$(payload[0].value)}</p>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  positive?: boolean;
  negative?: boolean;
}

function SummaryCard({ label, value, sub, icon, positive, negative }: SummaryCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/70">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center">
          <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} className="text-muted-foreground" />
        </div>
      </div>
      <span className={`text-xl font-bold font-mono-nums ${positive ? 'text-positive' : negative ? 'text-negative' : 'text-foreground'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
function TransactionRow({ tx }: { tx: Transaction }) {
  const isPositive = (tx.pnl ?? 0) >= 0;
  const typeColors: Record<string, string> = {
    open: 'bg-primary/10 text-primary border-primary/20',
    close: 'bg-muted/60 text-muted-foreground border-border',
    rebalance: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors duration-100">
      {/* Pair */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="CircleStackIcon" size={13} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{tx.pair}</p>
            <p className="text-xs text-muted-foreground font-mono-nums">{tx.fee}% fee</p>
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold capitalize ${typeColors[tx.type]}`}>
          {tx.type}
        </span>
      </td>

      {/* Entry */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-mono-nums text-foreground">{tx.entryDate.split(' ')[0]}</span>
          <span className="text-xs font-mono-nums text-muted-foreground">{tx.entryDate.split(' ')[1]}</span>
        </div>
      </td>

      {/* Exit */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        {tx.exitDate ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono-nums text-foreground">{tx.exitDate.split(' ')[0]}</span>
            <span className="text-xs font-mono-nums text-muted-foreground">{tx.exitDate.split(' ')[1]}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-positive font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
            Active
          </span>
        )}
      </td>

      {/* Capital */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-sm font-mono-nums text-foreground">{fmt$(tx.entryCapital)}</span>
      </td>

      {/* Exit Value */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        {tx.exitValue !== null ? (
          <span className="text-sm font-mono-nums text-foreground">{fmt$(tx.exitValue)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* PnL */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        {tx.pnl !== null ? (
          <span className={`text-sm font-mono-nums font-semibold ${isPositive ? 'text-positive' : 'text-negative'}`}>
            {isPositive ? '+' : ''}{fmt$(tx.pnl)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Fees */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-sm font-mono-nums text-positive">{fmt$(tx.feesEarned)}</span>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        {tx.status === 'active' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-positive/10 border border-positive/30 text-positive text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border text-muted-foreground text-xs font-semibold">
            Closed
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { isConnected, isConnecting, lpPositions } = useWallet();
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
  const [txFilter, setTxFilter] = useState<'all' | 'active' | 'closed'>('all');
  void txFilter; // used for future filter UI

  const timeRanges: TimeRange[] = ['1W', '1M', '3M', 'ALL'];

  // Historical data requires indexer — not available yet
  const pnlData: { date: string; cumPnl: number }[] = [];
  const feesData: { date: string; fees: number }[] = [];

  // Derive real metrics from live wallet positions where possible
  const totalCumPnl = lpPositions.reduce((s, p) => s + p.pnl, 0);
  const totalFees = lpPositions.reduce((s, p) => s + p.feesEarned, 0);
  const totalCapitalDeployed = lpPositions.reduce((s, p) => s + p.capital, 0);
  const winRate = lpPositions.length > 0
    ? (lpPositions.filter((p) => p.pnl > 0).length / lpPositions.length) * 100
    : 0;

  // No historical transaction log without indexer
  const filteredTx: Transaction[] = []; // will be populated when indexer is available

  const lastPnl = totalCumPnl;
  const isPositiveOverall = lastPnl >= 0;

  // Disconnected state
  if (!isConnected && !isConnecting) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
            <Icon name="PresentationChartLineIcon" size={28} className="text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Connect your wallet</h2>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Connect your wallet to view your historical performance analytics, PnL charts, and transaction log.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Historical performance across all LP positions</p>
          </div>
          {/* Time Range Selector */}
          <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-xl p-1">
            {timeRanges.map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  timeRange === r
                    ? 'bg-card border border-border text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Cumulative PnL"
            value={lpPositions.length > 0 ? `${totalCumPnl >= 0 ? '+' : ''}${fmt$(totalCumPnl)}` : 'N/A'}
            sub={lpPositions.length > 0 && totalCapitalDeployed > 0 ? fmtPct((totalCumPnl / totalCapitalDeployed) * 100) : 'No positions'}
            icon="TrendingUpIcon"
            positive={totalCumPnl >= 0 && lpPositions.length > 0}
            negative={totalCumPnl < 0}
          />
          <SummaryCard
            label="Total Fees Earned"
            value={lpPositions.length > 0 ? fmt$(totalFees) : 'N/A'}
            sub={`${lpPositions.length} position${lpPositions.length !== 1 ? 's' : ''}`}
            icon="BanknotesIcon"
            positive={totalFees > 0}
          />
          <SummaryCard
            label="Capital Deployed"
            value={lpPositions.length > 0 ? fmt$(totalCapitalDeployed) : 'N/A'}
            sub="Active positions"
            icon="CircleStackIcon"
          />
          <SummaryCard
            label="Win Rate"
            value={lpPositions.length > 0 ? `${winRate.toFixed(0)}%` : 'N/A'}
            sub={lpPositions.length > 0 ? `${lpPositions.filter((p) => p.pnl > 0).length} / ${lpPositions.length} positions` : 'No positions'}
            icon="TrophyIcon"
            positive={winRate >= 50 && lpPositions.length > 0}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Cumulative PnL Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">Cumulative PnL</h2>
                <p className={`text-xs font-mono-nums mt-0.5 ${isPositiveOverall ? 'text-positive' : 'text-negative'}`}>
                  {lpPositions.length > 0 ? `${isPositiveOverall ? '+' : ''}${fmt$(lastPnl)} total` : 'Historical data incomplete'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon name="TrendingUpIcon" size={16} className="text-primary" />
              </div>
            </div>
            {pnlData.length === 0 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={24} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground font-semibold">Historical data incomplete</p>
                <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
                  Historical PnL chart requires indexer integration for Robinhood Chain.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={pnlData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-positive, #22c55e)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--color-positive, #22c55e)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #888)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #888)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} width={48} />
                  <Tooltip content={<PnlTooltip />} />
                  <Area type="monotone" dataKey="cumPnl" stroke="#22c55e" strokeWidth={2} fill="url(#pnlGradient)" dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Fees Earned Over Time */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-foreground">Fees Earned Over Time</h2>
                <p className="text-xs font-mono-nums text-positive mt-0.5">
                  {lpPositions.length > 0 ? `${fmt$(totalFees)} total` : 'Historical data incomplete'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-positive/10 flex items-center justify-center">
                <Icon name="BanknotesIcon" size={16} className="text-positive" />
              </div>
            </div>
            {feesData.length === 0 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={24} className="text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground font-semibold">Historical data incomplete</p>
                <p className="text-xs text-muted-foreground/70 text-center max-w-xs">
                  Historical fees chart requires indexer integration for Robinhood Chain.
                </p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={feesData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #888)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #888)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={44}
                />
                <Tooltip content={<FeesTooltip />} />
                <Bar
                  dataKey="fees"
                  fill="#22c55e"
                  fillOpacity={0.8}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Transaction Log */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-foreground">Position Transaction Log</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Historical data incomplete — indexer required</p>
            </div>
          </div>
          <div className="p-8 flex flex-col items-center gap-3">
            <Icon name="ExclamationTriangleIcon" size={28} className="text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">Historical data incomplete</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              Transaction history requires indexer integration for Robinhood Chain. Entry/exit timestamps and historical PnL will be available once the indexer is connected.
            </p>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
