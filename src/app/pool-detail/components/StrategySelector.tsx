'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

type Strategy = 'spot' | 'curve' | 'bid-ask';

interface StrategyConfig {
  id: Strategy;
  label: string;
  icon: string;
  description: string;
  detail: string;
  rangeMultiplier: number;
}

const STRATEGIES: StrategyConfig[] = [
  {
    id: 'spot',
    label: 'Spot',
    icon: 'MapPinIcon',
    description: 'Concentrate liquidity around the current price.',
    detail:
      'Designed for markets where price is expected to remain close to the current trading area. As price moves away from center, inventory shifts entirely into one token. Higher fee capture when price stays near entry.',
    rangeMultiplier: 0.05,
  },
  {
    id: 'curve',
    label: 'Curve',
    icon: 'ChartBarSquareIcon',
    description: 'Distribute liquidity across a broader price zone.',
    detail:
      'Designed for markets expected to trade within a defined price zone. Liquidity is spread more evenly, reducing fee concentration but improving range resilience. Inventory changes gradually as price moves through the zone.',
    rangeMultiplier: 0.15,
  },
  {
    id: 'bid-ask',
    label: 'Bid Ask',
    icon: 'ArrowsUpDownIcon',
    description: 'Place liquidity across both sides of the current price.',
    detail:
      'Designed to capture swap activity as price moves between bid and ask regions. Liquidity is split into two concentrated zones on either side. When price crosses center, inventory composition shifts between the two tokens.',
    rangeMultiplier: 0.1,
  },
];

interface StrategySelectorProps {
  currentPrice: number;
  onStrategyChange: (strategy: Strategy, lower: number, upper: number) => void;
}

export default function StrategySelector({ currentPrice, onStrategyChange }: StrategySelectorProps) {
  const [selected, setSelected] = useState<Strategy>('spot');
  const [capital, setCapital] = useState('10000');

  // Initialize with computed values so SSR and client render identical input values
  const spotConfig = STRATEGIES.find((s) => s.id === 'spot')!;
  const [customLower, setCustomLower] = useState((currentPrice * (1 - spotConfig.rangeMultiplier)).toFixed(2));
  const [customUpper, setCustomUpper] = useState((currentPrice * (1 + spotConfig.rangeMultiplier)).toFixed(2));

  const handleSelect = (strategy: Strategy) => {
    setSelected(strategy);
    const config = STRATEGIES.find((s) => s.id === strategy)!;
    const lower = currentPrice * (1 - config.rangeMultiplier);
    const upper = currentPrice * (1 + config.rangeMultiplier);
    setCustomLower(lower.toFixed(2));
    setCustomUpper(upper.toFixed(2));
    onStrategyChange(strategy, lower, upper);
  };

  const handleRangeApply = () => {
    const lower = parseFloat(customLower);
    const upper = parseFloat(customUpper);
    if (!isNaN(lower) && !isNaN(upper) && lower < upper) {
      onStrategyChange(selected, lower, upper);
    }
  };

  const selectedConfig = STRATEGIES.find((s) => s.id === selected)!;
  const lowerDefault = currentPrice * (1 - selectedConfig.rangeMultiplier);
  const upperDefault = currentPrice * (1 + selectedConfig.rangeMultiplier);

  return (
    <div className="space-y-4">
      {/* Strategy tabs */}
      <div className="grid grid-cols-3 gap-2">
        {STRATEGIES.map((s) => (
          <button
            suppressHydrationWarning
            key={`strat-${s.id}`}
            onClick={() => handleSelect(s.id)}
            className={`
              flex flex-col items-start p-3 rounded-xl border transition-all duration-150 text-left
              ${selected === s.id
                ? 'border-primary/50 bg-primary/8 shadow-sm'
                : 'border-border bg-muted/20 hover:border-border/80 hover:bg-muted/40'
              }
            `}
          >
            <div className={`p-1.5 rounded-lg mb-2 ${selected === s.id ? 'bg-primary/20' : 'bg-muted/60'}`}>
              <Icon
                name={s.icon as Parameters<typeof Icon>[0]['name']}
                size={14}
                className={selected === s.id ? 'text-primary' : 'text-muted-foreground'}
              />
            </div>
            <p className={`text-sm font-semibold mb-0.5 ${selected === s.id ? 'text-primary' : 'text-foreground'}`}>
              {s.label}
            </p>
            <p className="text-xs text-muted-foreground leading-snug">{s.description}</p>
          </button>
        ))}
      </div>

      {/* Strategy detail */}
      <div className="rounded-xl bg-muted/30 border border-border p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{selectedConfig.detail}</p>
        <p className="text-xs text-warning mt-2">
          ⚠ Inventory composition changes as price moves. This is not a directional strategy.
        </p>
      </div>

      {/* Capital & Range inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Initial Capital (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              suppressHydrationWarning
              type="number"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              className="input-field pl-6"
              placeholder="10000"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Lower Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              suppressHydrationWarning
              type="number"
              value={customLower}
              onChange={(e) => setCustomLower(e.target.value)}
              className="input-field pl-6"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Upper Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <input
              suppressHydrationWarning
              type="number"
              value={customUpper}
              onChange={(e) => setCustomUpper(e.target.value)}
              className="input-field pl-6"
            />
          </div>
        </div>
      </div>

      <button
        suppressHydrationWarning
        onClick={handleRangeApply}
        className="btn-secondary w-full text-sm"
      >
        <Icon name="AdjustmentsHorizontalIcon" size={14} />
        Apply Range to Chart
      </button>

      {/* Capital split estimate */}
      <div className="rounded-xl bg-muted/30 border border-border p-3">
        <p className="text-xs font-semibold text-foreground mb-2">Estimated Capital Split</p>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: '50%' }} />
          </div>
          <span className="text-xs font-mono-nums text-muted-foreground w-20 text-right">
            50% / 50%
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ETH</span>
            <span className="font-mono-nums text-foreground">
              {capital ? (parseFloat(capital) / 2 / currentPrice).toFixed(4) : '—'} ETH
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">USDC</span>
            <span className="font-mono-nums text-foreground">
              ${capital ? (parseFloat(capital) / 2).toFixed(2) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}