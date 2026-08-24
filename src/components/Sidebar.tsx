'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useChainStatus } from '@/hooks/useChainData';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  isDemo?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/', icon: 'SquaresIcon' },
      { label: 'Pool Scanner', href: '/pool-scanner', icon: 'MagnifyingGlassIcon' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { label: 'Pools', href: '/pool-detail', icon: 'CircleStackIcon' },
      { label: 'Positions', href: '/positions', icon: 'ChartBarIcon' },
      { label: 'Strategies', href: '/strategies', icon: 'AdjustmentsHorizontalIcon', isDemo: true },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Analytics', href: '/analytics', icon: 'PresentationChartLineIcon' },
      { label: 'Scanner', href: '/scanner', icon: 'SignalIcon' },
      { label: 'Alerts', href: '/alerts', icon: 'BellIcon', badge: 2, isDemo: true },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: 'Cog6ToothIcon', isDemo: true },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { chainStatus } = useChainStatus();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const statusColor =
    chainStatus.status === 'live' ?'bg-positive-subtle border-positive text-positive'
      : chainStatus.status === 'error' ?'bg-destructive/10 border-destructive text-destructive'
      : chainStatus.status === 'stale' ?'bg-warning-subtle border-warning text-warning' :'bg-muted/40 border-border text-muted-foreground';

  const dotColor =
    chainStatus.status === 'live' ?'live-dot'
      : chainStatus.status === 'error' ?'w-2 h-2 rounded-full bg-destructive flex-shrink-0'
      : chainStatus.status === 'stale' ?'w-2 h-2 rounded-full bg-warning flex-shrink-0' :'w-2 h-2 rounded-full bg-muted-foreground animate-pulse flex-shrink-0';

  const statusLabel =
    chainStatus.status === 'live' ?'Robinhood Chain'
      : chainStatus.status === 'error' ?'Connection Error'
      : chainStatus.status === 'stale' ?'Stale Data' :'Connecting…';

  return (
    <aside
      className={`
        fixed left-0 top-0 h-full z-40 flex flex-col
        bg-card border-r border-border
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-border px-3 ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="flex-shrink-0">
          <AppLogo size={32} src="/assets/binara-wordmark.svg" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-foreground tracking-tight">BINARA</span>
            <span className="text-xs text-muted-foreground">Liquidity Intelligence</span>
          </div>
        )}
      </div>

      {/* Network status */}
      {!collapsed && (
        <div className={`mx-3 mt-3 px-3 py-2 rounded-lg border flex items-center gap-2 ${statusColor}`}>
          <div className={dotColor} />
          <span className="text-xs font-medium">{statusLabel}</span>
          {chainStatus.status === 'live' && (
            <span className="ml-auto text-xs text-muted-foreground font-mono-nums">4663</span>
          )}
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center mt-3">
          <div className={dotColor} />
        </div>
      )}

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navGroups.map((group) => (
          <div key={`group-${group.title}`} className="mb-4">
            {!collapsed && (
              <p className="px-2 mb-1 text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={`nav-${item.href}`}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`
                    relative flex items-center gap-3 px-2 py-2 rounded-lg mb-0.5
                    transition-all duration-150 group
                    ${active
                      ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }
                    ${collapsed ? 'justify-center' : ''}
                  `}
                >
                  <Icon
                    name={item.icon as Parameters<typeof Icon>[0]['name']}
                    size={18}
                    className={active ? 'text-primary' : ''}
                  />
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium flex-1">{item.label}</span>
                      {item.isDemo && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60 font-medium">
                          Soon
                        </span>
                      )}
                      {item.badge !== undefined && !item.isDemo && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold min-w-[20px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge !== undefined && !item.isDemo && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
                  )}
                  {/* Tooltip for collapsed */}
                  {collapsed && (
                    <div className="
                      absolute left-full ml-2 px-2 py-1 rounded-md
                      bg-secondary border border-border text-xs text-foreground font-medium
                      opacity-0 pointer-events-none group-hover:opacity-100
                      transition-opacity duration-150 whitespace-nowrap z-50
                    ">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: collapse toggle */}
      <div className="border-t border-border p-2">
        <button
          suppressHydrationWarning
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'ChevronRightIcon' : 'ChevronLeftIcon'} size={16} />
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}