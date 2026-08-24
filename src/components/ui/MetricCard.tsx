import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  change?: number;
  changeLabel?: string;
  icon?: string;
  variant?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export default function MetricCard({
  label,
  value,
  subValue,
  change,
  changeLabel,
  icon,
  variant = 'default',
  size = 'md',
  className = '',
  children,
}: MetricCardProps) {
  const variantClasses = {
    default: 'border-border',
    positive: 'border-positive/30 bg-positive-subtle',
    negative: 'border-negative/30 bg-negative-subtle',
    warning: 'border-warning/30 bg-warning-subtle',
    info: 'border-info/30 bg-info-subtle',
  };

  const iconColor = {
    default: 'text-muted-foreground',
    positive: 'text-positive',
    negative: 'text-negative',
    warning: 'text-warning',
    info: 'text-info',
  };

  const valueSize = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div
      className={`
        rounded-xl border bg-card p-4 card-hover
        ${variantClasses[variant]}
        ${className}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="data-label">{label}</p>
        {icon && (
          <div className={`p-1.5 rounded-lg bg-muted/60 ${iconColor[variant]}`}>
            <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={14} />
          </div>
        )}
      </div>
      <p className={`font-bold font-mono-nums text-foreground ${valueSize[size]}`}>{value}</p>
      {subValue && (
        <p className="text-xs text-muted-foreground mt-0.5 font-mono-nums">{subValue}</p>
      )}
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <Icon
            name={change >= 0 ? 'ArrowUpIcon' : 'ArrowDownIcon'}
            size={12}
            className={change >= 0 ? 'text-positive' : 'text-negative'}
          />
          <span
            className={`text-xs font-medium font-mono-nums ${
              change >= 0 ? 'text-positive' : 'text-negative'
            }`}
          >
            {Math.abs(change).toFixed(2)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-muted-foreground">{changeLabel}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}