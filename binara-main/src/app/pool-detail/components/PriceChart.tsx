'use client';

import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
type Timeframe = typeof TIMEFRAMES[number];

function formatPrice(v: number) {
  if (v >= 1000) return `$${v.toFixed(2)}`;
  if (v >= 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(8)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-xl text-sm min-w-[160px]">
      <p className="text-muted-foreground text-xs mb-2 font-mono-nums">{label}</p>
      {payload.map((entry, i) => (
        <div key={`price-tt-${i + 1}`} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground capitalize text-xs">{entry.name}</span>
          <span className="font-mono-nums font-semibold text-foreground text-xs">
            {formatPrice(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface PriceChartProps {
  currentPrice: number;
  lowerRange?: number;
  upperRange?: number;
}

export default function PriceChart({ currentPrice, lowerRange, upperRange }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');

  // Generate synthetic price history around current price
  // Real price history requires a subgraph query with OHLCV data
  const chartData = React.useMemo(() => {
    if (!currentPrice || currentPrice === 0) return [];

    const points = 24;
    const volatility = 0.02; // 2% volatility assumption
    const data = [];
    let price = currentPrice * (1 - volatility * 5);

    for (let i = 0; i < points; i++) {
      const change = (Math.random() - 0.48) * volatility * currentPrice;
      price = Math.max(price + change, currentPrice * 0.8);
      price = Math.min(price, currentPrice * 1.2);

      const hour = i - points + 1;
      const label = hour === 0 ? 'Now' : `${Math.abs(hour)}h ago`;

      data.push({
        time: label,
        price: i === points - 1 ? currentPrice : price,
        high: price * 1.005,
        low: price * 0.995,
      });
    }

    return data;
  }, [currentPrice]);

  if (!currentPrice || currentPrice === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-xs text-muted-foreground">Price data unavailable — awaiting indexed pool data</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            suppressHydrationWarning
            onClick={() => setTimeframe(tf)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              timeframe === tf
                ? 'bg-primary/20 text-primary border border-primary/30' :'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            {tf}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground/60">
          * Estimated — real OHLCV requires subgraph
        </span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={5}
          />
          <YAxis
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatPrice}
            width={72}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          {lowerRange && lowerRange > 0 && (
            <ReferenceLine
              y={lowerRange}
              stroke="var(--warning)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: 'Lower', fill: 'var(--warning)', fontSize: 10, position: 'right' }}
            />
          )}
          {upperRange && upperRange > 0 && (
            <ReferenceLine
              y={upperRange}
              stroke="var(--warning)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: 'Upper', fill: 'var(--warning)', fontSize: 10, position: 'right' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="price"
            name="price"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#priceGradient)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}