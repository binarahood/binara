'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface ActivityItem {
  id: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity' | 'alert';
  pool: string;
  description: string;
  amount?: string;
  txHash?: string;
  timestamp: string;
}

function ActivityIcon({ type }: { type: ActivityItem['type'] }) {
  const config = {
    swap: { icon: 'ArrowsRightLeftIcon', bg: 'bg-info-subtle', color: 'text-info' },
    add_liquidity: { icon: 'PlusCircleIcon', bg: 'bg-positive-subtle', color: 'text-positive' },
    remove_liquidity: { icon: 'MinusCircleIcon', bg: 'bg-warning-subtle', color: 'text-warning' },
    alert: { icon: 'ExclamationTriangleIcon', bg: 'bg-negative-subtle', color: 'text-negative' },
  };
  const c = config[type];
  return (
    <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon name={c.icon as Parameters<typeof Icon>[0]['name']} size={14} className={c.color} />
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen to SSE stream for real swap events
    const es = new EventSource('/api/chain/stream');

    es.addEventListener('swap', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const item: ActivityItem = {
          id: data.txHash || `swap-${Date.now()}`,
          type: 'swap',
          pool: data.pair || 'Unknown Pool',
          description: `Swap on block #${data.blockNumber}`,
          amount: data.volumeUSD ? `$${data.volumeUSD.toFixed(2)}` : undefined,
          txHash: data.txHash ? `${data.txHash.slice(0, 10)}…` : undefined,
          timestamp: timeAgo(data.timestamp || Math.floor(Date.now() / 1000)),
        };
        setActivities((prev) => [item, ...prev].slice(0, 20));
        setIsLoading(false);
      } catch { /* ignore */ }
    });

    es.addEventListener('status', () => {
      setIsLoading(false);
    });

    es.addEventListener('block', () => {
      setIsLoading(false);
    });

    es.onerror = () => {
      setIsLoading(false);
    };

    // Timeout: if no events after 10s, stop loading
    const timeout = setTimeout(() => setIsLoading(false), 10_000);

    return () => {
      es.close();
      clearTimeout(timeout);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs text-muted-foreground">Waiting for live activity…</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center">
          <Icon name="BoltIcon" size={16} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground/60 text-center">
          Real swap events will appear here as they occur on Robinhood Chain
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors duration-100 group"
        >
          <ActivityIcon type={item.type} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {item.pool}
                <span className="text-muted-foreground font-normal ml-1">— {item.description}</span>
              </p>
              <span className="text-xs text-muted-foreground font-mono-nums flex-shrink-0">{item.timestamp}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {item.amount && (
                <span className="text-xs font-mono-nums font-semibold text-foreground">{item.amount}</span>
              )}
              {item.txHash && (
                <span className="text-xs text-muted-foreground/60 font-mono-nums opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.txHash}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}