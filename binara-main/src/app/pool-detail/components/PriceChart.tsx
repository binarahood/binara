'use client';

import React, { useMemo, useState } from 'react';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
type Timeframe = typeof TIMEFRAMES[number];

function formatPrice(v: number) {
  if (!Number.isFinite(v)) return 'N/A';
  if (v >= 1000) return `$${v.toFixed(2)}`;
  if (v >= 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(8)}`;
}

interface PriceChartProps {
  currentPrice: number;
  lowerRange?: number;
  upperRange?: number;
}

export default function PriceChart({ currentPrice, lowerRange, upperRange }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');

  // Deterministic estimated history. Avoid Math.random()/chart-library runtime issues;
  // real OHLCV will replace this once historical pool indexing is available.
  const chartData = useMemo(() => {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];
    const points = 24;
    return Array.from({ length: points }, (_, i) => {
      const progress = i / (points - 1);
      const wave = Math.sin(i * 0.72) * 0.012 + Math.sin(i * 0.21) * 0.008;
      const trend = (progress - 1) * 0.008;
      const price = i === points - 1 ? currentPrice : currentPrice * (1 + wave + trend);
      return { price: Math.max(price, currentPrice * 0.8), label: i === points - 1 ? 'Now' : `${points - 1 - i}h ago` };
    });
  }, [currentPrice]);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || chartData.length < 2) {
    return <div className="flex items-center justify-center h-48"><p className="text-xs text-muted-foreground">Price data unavailable — awaiting indexed pool data</p></div>;
  }

  const width = 760;
  const height = 200;
  const padX = 8;
  const padY = 16;
  const values = chartData.map((p) => p.price).concat([lowerRange ?? currentPrice, upperRange ?? currentPrice]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, currentPrice * 0.01);
  const yMin = min - span * 0.08;
  const yMax = max + span * 0.08;
  const x = (i: number) => padX + (i / (chartData.length - 1)) * (width - padX * 2);
  const y = (v: number) => height - padY - ((v - yMin) / Math.max(yMax - yMin, Number.EPSILON)) * (height - padY * 2);
  const points = chartData.map((p, i) => `${x(i)},${y(p.price)}`).join(' ');
  const areaPoints = `${padX},${height - padY} ${points} ${width - padX},${height - padY}`;
  const lowerY = lowerRange && lowerRange > 0 ? y(lowerRange) : null;
  const upperY = upperRange && upperRange > 0 ? y(upperRange) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {TIMEFRAMES.map((tf) => (
          <button key={tf} onClick={() => setTimeframe(tf)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${timeframe === tf ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}>{tf}</button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground/60">* Estimated — real OHLCV requires subgraph</span>
      </div>

      <div className="w-full overflow-hidden rounded-lg">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[200px]" role="img" aria-label="Estimated pool price chart">
          <defs>
            <linearGradient id="binaraPriceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((r) => <line key={r} x1={padX} x2={width - padX} y1={padY + r * (height - padY * 2)} y2={padY + r * (height - padY * 2)} stroke="var(--border)" strokeDasharray="3 3" />)}
          {lowerY !== null && lowerY >= 0 && lowerY <= height && <line x1={padX} x2={width - padX} y1={lowerY} y2={lowerY} stroke="var(--warning)" strokeDasharray="4 4" strokeWidth="1.5" />}
          {upperY !== null && upperY >= 0 && upperY <= height && <line x1={padX} x2={width - padX} y1={upperY} y2={upperY} stroke="var(--warning)" strokeDasharray="4 4" strokeWidth="1.5" />}
          <polygon points={areaPoints} fill="url(#binaraPriceGradient)" />
          <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(chartData.length - 1)} cy={y(currentPrice)} r="4" fill="var(--primary)" />
        </svg>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono-nums"><span>{chartData[0].label}</span><span>Current: {formatPrice(currentPrice)}</span><span>{chartData[chartData.length - 1].label}</span></div>
    </div>
  );
}
