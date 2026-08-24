'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}
function fmtUSD(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ScenarioRow {
  id: string;
  label: string;
  priceChange: number;
  price: number;
  tokenAAmount: number;
  tokenBAmount: number;
  positionValue: number;
  feesEarned: number;
  hodlValue: number;
  ilPercent: number;
  inRange: boolean;
}

function generateScenarios(
  initialCapital: number,
  currentPrice: number,
  lowerPrice: number,
  upperPrice: number,
  feeEstimate: number
): ScenarioRow[] {
  if (!currentPrice || currentPrice === 0) return [];

  const scenarios = [
    { id: 'scen-1', label: '-90%', priceChange: -0.9 },
    { id: 'scen-2', label: '-75%', priceChange: -0.75 },
    { id: 'scen-3', label: '-50%', priceChange: -0.5 },
    { id: 'scen-4', label: '-25%', priceChange: -0.25 },
    { id: 'scen-5', label: 'Current', priceChange: 0 },
    { id: 'scen-6', label: '+25%', priceChange: 0.25 },
    { id: 'scen-7', label: '+50%', priceChange: 0.5 },
    { id: 'scen-8', label: '+100%', priceChange: 1.0 },
    { id: 'scen-9', label: '+200%', priceChange: 2.0 },
  ];

  const initialTokenA = initialCapital / 2 / currentPrice;
  const initialTokenB = initialCapital / 2;

  return scenarios.map((s) => {
    const newPrice = currentPrice * (1 + s.priceChange);
    const inRange = newPrice >= lowerPrice && newPrice <= upperPrice;
    const priceRatio = Math.sqrt(newPrice / currentPrice);

    let tokenAAmount: number;
    let tokenBAmount: number;

    if (newPrice <= lowerPrice) {
      tokenAAmount = initialTokenA * 2;
      tokenBAmount = 0;
    } else if (newPrice >= upperPrice) {
      tokenAAmount = 0;
      tokenBAmount = initialCapital;
    } else {
      tokenAAmount = initialTokenA / priceRatio;
      tokenBAmount = initialTokenB * priceRatio;
    }

    const positionValue = tokenAAmount * newPrice + tokenBAmount;
    const hodlValue = initialTokenA * newPrice + initialTokenB;
    const ilPercent = ((positionValue - hodlValue) / hodlValue) * 100;
    const feesEarned = inRange ? feeEstimate * (1 + s.priceChange * 0.3) : feeEstimate * 0.1;

    return {
      ...s,
      price: newPrice,
      tokenAAmount,
      tokenBAmount,
      positionValue,
      feesEarned,
      hodlValue,
      ilPercent,
      inRange,
    };
  });
}

interface ScenarioTableProps {
  initialCapital: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  feeEstimate: number;
}

export default function ScenarioTable({
  initialCapital,
  currentPrice,
  lowerPrice,
  upperPrice,
  feeEstimate,
}: ScenarioTableProps) {
  const scenarios = generateScenarios(initialCapital, currentPrice, lowerPrice, upperPrice, feeEstimate);

  if (scenarios.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-xs text-muted-foreground">Price data unavailable — simulation requires live pool data</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning-subtle border border-warning/30">
        <Icon name="BeakerIcon" size={14} className="text-warning flex-shrink-0" />
        <p className="text-xs text-warning/90">
          <span className="font-semibold">Simulation only.</span> These figures are mathematical estimates based on
          concentrated liquidity formulas. They do not predict future prices or guarantee any returns.
          Actual results will differ based on fee accumulation, price path, and rebalancing events.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="table-header-cell">Scenario</th>
              <th className="table-header-cell">Price</th>
              <th className="table-header-cell">Token X</th>
              <th className="table-header-cell">Token Y</th>
              <th className="table-header-cell">Position Value</th>
              <th className="table-header-cell">Est. Fees</th>
              <th className="table-header-cell">HODL Value</th>
              <th className="table-header-cell">IL vs HODL</th>
              <th className="table-header-cell">In Range</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const isCurrent = s.label === 'Current';
              return (
                <tr
                  key={s.id}
                  className={`border-b border-border/40 transition-colors ${
                    isCurrent
                      ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/20'
                  }`}
                >
                  <td className="table-row-cell">
                    <span className={`font-semibold font-mono-nums ${
                      isCurrent ? 'text-primary' :
                      s.priceChange > 0 ? 'text-positive' : 'text-negative'
                    }`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="table-row-cell font-mono-nums text-foreground">
                    ${fmt(s.price, s.price > 100 ? 2 : 4)}
                  </td>
                  <td className="table-row-cell font-mono-nums text-foreground">
                    {fmt(s.tokenAAmount, 4)}
                  </td>
                  <td className="table-row-cell font-mono-nums text-foreground">
                    {fmtUSD(s.tokenBAmount)}
                  </td>
                  <td className="table-row-cell">
                    <span className={`font-mono-nums font-semibold ${
                      s.positionValue >= initialCapital ? 'text-positive' : 'text-negative'
                    }`}>
                      {fmtUSD(s.positionValue)}
                    </span>
                  </td>
                  <td className="table-row-cell">
                    <span className={`font-mono-nums ${s.inRange ? 'text-positive' : 'text-muted-foreground'}`}>
                      {fmtUSD(s.feesEarned)}
                    </span>
                  </td>
                  <td className="table-row-cell font-mono-nums text-muted-foreground">
                    {fmtUSD(s.hodlValue)}
                  </td>
                  <td className="table-row-cell">
                    <span className={`font-mono-nums font-semibold ${
                      s.ilPercent >= 0 ? 'text-positive' : 'text-negative'
                    }`}>
                      {s.ilPercent >= 0 ? '+' : ''}{fmt(s.ilPercent, 2)}%
                    </span>
                  </td>
                  <td className="table-row-cell">
                    {s.inRange ? (
                      <span className="status-in-range">
                        <span className="w-1.5 h-1.5 rounded-full bg-positive" />
                        Yes
                      </span>
                    ) : (
                      <span className="status-out-of-range">
                        <span className="w-1.5 h-1.5 rounded-full bg-negative" />
                        No
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        <div className="rounded-lg bg-muted/30 border border-border p-2.5 text-center">
          <p className="text-xs text-muted-foreground mb-1">Capital</p>
          <p className="text-sm font-mono-nums font-bold text-foreground">{fmtUSD(initialCapital)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-2.5 text-center">
          <p className="text-xs text-muted-foreground mb-1">Lower Range</p>
          <p className="text-sm font-mono-nums font-bold text-foreground">${lowerPrice.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-2.5 text-center">
          <p className="text-xs text-muted-foreground mb-1">Upper Range</p>
          <p className="text-sm font-mono-nums font-bold text-foreground">${upperPrice.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-2.5 text-center">
          <p className="text-xs text-muted-foreground mb-1">Range Width</p>
          <p className="text-sm font-mono-nums font-bold text-foreground">
            {currentPrice > 0 ? `${(((upperPrice - lowerPrice) / currentPrice) * 100).toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}