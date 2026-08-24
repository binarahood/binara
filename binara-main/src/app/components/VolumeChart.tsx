'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

interface VolumePoint {
  time: string;
  volume: number;
  fees: number;
  tvl: number;
}

function formatVolume(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-xl text-sm min-w-[160px]">
      <p className="text-muted-foreground text-xs mb-2 font-mono-nums">{label}</p>
      {payload.map((entry, i) => (
        <div key={`tt-${i + 1}`} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground capitalize">{entry.name}</span>
          <span className="font-mono-nums font-semibold text-foreground">
            {formatVolume(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface VolumeChartProps {
  type?: 'area' | 'bar';
  height?: number;
}

export default function VolumeChart({ type = 'area', height = 200 }: VolumeChartProps) {
  const [chartData, setChartData] = useState<VolumePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch pool data and build volume chart from real indexed data
    async function loadVolumeData() {
      try {
        const res = await fetch('/api/chain/pools', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok || !data.pools || data.pools.length === 0) {
          setIsLoading(false);
          return;
        }

        // Build a simple volume bar from available data
        // We have 1h, 6h, 24h aggregates — create a time-bucketed view
        const pools = data.pools;
        const totalVol1h = pools.reduce((s: number, p: { volume1h?: number | null }) => s + (p.volume1h ?? 0), 0);
        const totalVol6h = pools.reduce((s: number, p: { volume6h?: number | null }) => s + (p.volume6h ?? 0), 0);
        const totalVol24h = pools.reduce((s: number, p: { volume24h?: number | null }) => s + (p.volume24h ?? 0), 0);
        const totalTVL = pools.reduce((s: number, p: { tvl?: number | null }) => s + (p.tvl ?? 0), 0);
        const totalFee = pools.reduce((s: number, p: { fee?: number; volume24h?: number | null }) => s + (p.fee ?? 0) * (p.volume24h ?? 0) / 100, 0);

        // Derive approximate hourly buckets from available aggregates
        const vol6hExcl1h = Math.max(0, totalVol6h - totalVol1h);
        const vol24hExcl6h = Math.max(0, totalVol24h - totalVol6h);

        const points: VolumePoint[] = [
          { time: '24h ago', volume: vol24hExcl6h / 18, fees: (vol24hExcl6h / 18) * 0.003, tvl: totalTVL },
          { time: '18h ago', volume: vol24hExcl6h / 18, fees: (vol24hExcl6h / 18) * 0.003, tvl: totalTVL },
          { time: '12h ago', volume: vol24hExcl6h / 18, fees: (vol24hExcl6h / 18) * 0.003, tvl: totalTVL },
          { time: '6h ago', volume: vol6hExcl1h / 5, fees: (vol6hExcl1h / 5) * 0.003, tvl: totalTVL },
          { time: '5h ago', volume: vol6hExcl1h / 5, fees: (vol6hExcl1h / 5) * 0.003, tvl: totalTVL },
          { time: '4h ago', volume: vol6hExcl1h / 5, fees: (vol6hExcl1h / 5) * 0.003, tvl: totalTVL },
          { time: '3h ago', volume: vol6hExcl1h / 5, fees: (vol6hExcl1h / 5) * 0.003, tvl: totalTVL },
          { time: '2h ago', volume: vol6hExcl1h / 5, fees: (vol6hExcl1h / 5) * 0.003, tvl: totalTVL },
          { time: '1h ago', volume: totalVol1h, fees: totalFee, tvl: totalTVL },
          { time: 'Now', volume: totalVol1h * 0.1, fees: totalFee * 0.1, tvl: totalTVL },
        ];

        setChartData(points.filter((p) => p.volume > 0 || p.tvl > 0));
      } catch {
        // Chart unavailable
      } finally {
        setIsLoading(false);
      }
    }

    loadVolumeData();
    const id = setInterval(loadVolumeData, 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground">Loading volume data…</p>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-muted-foreground">Historical data incomplete</p>
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatVolume}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="volume" name="volume" fill="var(--primary)" radius={[3, 3, 0, 0]} opacity={0.85} />
          <Bar dataKey="fees" name="fees" fill="var(--accent)" radius={[3, 3, 0, 0]} opacity={0.7} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatVolume}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="volume"
          name="volume"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#volGradient)"
        />
        <Area
          type="monotone"
          dataKey="tvl"
          name="tvl"
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill="url(#tvlGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}