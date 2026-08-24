'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export interface FilterState {
  minTVL: number;
  minVolume: number;
  minVolToTVL: number;
  maxVolatility: number;
  feeTiers: number[];
  riskLevels: string[];
  minScore: number;
  minSwaps: number;
}

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
}

const FEE_TIERS = [0.05, 0.1, 0.3, 1.0];
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];

function RangeInput({
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
        <span className="text-xs text-muted-foreground/60 font-mono-nums">{format(min)}</span>
        <span className="text-xs text-muted-foreground/60 font-mono-nums">{format(max)}</span>
      </div>
    </div>
  );
}

export default function FilterSidebar({ filters, onChange, onReset }: FilterSidebarProps) {
  const toggleFee = (fee: number) => {
    const next = filters.feeTiers.includes(fee)
      ? filters.feeTiers.filter((f) => f !== fee)
      : [...filters.feeTiers, fee];
    onChange({ ...filters, feeTiers: next });
  };

  const toggleRisk = (risk: string) => {
    const next = filters.riskLevels.includes(risk)
      ? filters.riskLevels.filter((r) => r !== risk)
      : [...filters.riskLevels, risk];
    onChange({ ...filters, riskLevels: next });
  };

  const riskColor: Record<string, string> = {
    LOW: 'text-positive border-positive/40 bg-positive-subtle',
    MEDIUM: 'text-warning border-warning/40 bg-warning-subtle',
    HIGH: 'text-negative border-negative/40 bg-negative-subtle',
    EXTREME: 'text-negative border-negative/40 bg-negative-subtle',
  };

  return (
    <div className="w-64 flex-shrink-0 rounded-xl border border-border bg-card p-4 space-y-5 self-start sticky top-24">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Filters</h3>
        <button
          onClick={onReset}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Icon name="ArrowPathIcon" size={12} />
          Reset
        </button>
      </div>

      {/* Analytics Score */}
      <div className="space-y-3">
        <p className="data-label">Minimum Score</p>
        <RangeInput
          label="Analytics Score ≥"
          value={filters.minScore}
          min={0}
          max={100}
          step={5}
          format={(v) => `${v}`}
          onChange={(v) => onChange({ ...filters, minScore: v })}
        />
      </div>

      {/* TVL */}
      <div className="space-y-3">
        <p className="data-label">Liquidity</p>
        <RangeInput
          label="Min TVL"
          value={filters.minTVL}
          min={0}
          max={10_000_000}
          step={100_000}
          format={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`}
          onChange={(v) => onChange({ ...filters, minTVL: v })}
        />
      </div>

      {/* Volume */}
      <div className="space-y-3">
        <p className="data-label">Volume</p>
        <RangeInput
          label="Min 24h Volume"
          value={filters.minVolume}
          min={0}
          max={30_000_000}
          step={500_000}
          format={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`}
          onChange={(v) => onChange({ ...filters, minVolume: v })}
        />
        <RangeInput
          label="Min Vol/TVL"
          value={filters.minVolToTVL}
          min={0}
          max={20}
          step={0.5}
          format={(v) => `${v.toFixed(1)}x`}
          onChange={(v) => onChange({ ...filters, minVolToTVL: v })}
        />
      </div>

      {/* Volatility */}
      <div className="space-y-3">
        <p className="data-label">Volatility</p>
        <RangeInput
          label="Max Volatility"
          value={filters.maxVolatility}
          min={1}
          max={25}
          step={0.5}
          format={(v) => `${v.toFixed(1)}%`}
          onChange={(v) => onChange({ ...filters, maxVolatility: v })}
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
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                filters.riskLevels.includes(risk)
                  ? riskColor[risk]
                  : 'bg-muted/20 text-muted-foreground border-border/50 hover:bg-muted/40'
              }`}
            >
              {risk}
              {filters.riskLevels.includes(risk) && (
                <Icon name="CheckIcon" size={12} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Min swaps */}
      <div>
        <p className="data-label mb-2">Activity</p>
        <RangeInput
          label="Min Swaps 24h"
          value={filters.minSwaps}
          min={0}
          max={10000}
          step={100}
          format={(v) => `${v.toLocaleString()}`}
          onChange={(v) => onChange({ ...filters, minSwaps: v })}
        />
      </div>

      {/* Scoring weights info */}
      <div className="rounded-lg bg-muted/40 border border-border p-3">
        <p className="text-xs font-semibold text-foreground mb-2">Score Weights</p>
        {[
          { label: 'Vol / Active Liq', w: '30%' },
          { label: 'Fee Tier', w: '20%' },
          { label: 'Vol Consistency', w: '20%' },
          { label: 'Time In Range', w: '15%' },
          { label: 'Liq Efficiency', w: '10%' },
          { label: 'Risk Adjustment', w: '5%' },
        ].map((row) => (
          <div key={`weight-${row.label}`} className="flex items-center justify-between py-0.5">
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="text-xs font-mono-nums font-semibold text-foreground">{row.w}</span>
          </div>
        ))}
      </div>
    </div>
  );
}