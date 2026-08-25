'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useChainStatus } from '@/hooks/useChainData';

// Project launch links — update these when BINARA launches.
const PROJECT_X_URL = '';
const CONTRACT_ADDRESS = '';

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
      // Pool Detail requires a specific ?address=... and must only be opened
      // from a selected pool. Keep the navigation entry on the scanner so the
      // user cannot land on an address-less detail page.
      { label: 'Pools', href: '/pool-scanner', icon: 'CircleStackIcon' },
      { label: 'Positions', href: '/positions', icon: 'ChartBarIcon' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Analytics', href: '/analytics', icon: 'PresentationChartLineIcon' },
      { label: 'Scanner', href: '/scanner', icon: 'SignalIcon' },
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
    chainStatus.status === 'live' ? 'bg-positive-subtle border-positive text-positive'
      : chainStatus.status === 'error' ? 'bg-destructive/10 border-destructive text-destructive'
      : chainStatus.status === 'stale' ? 'bg-warning-subtle border-warning text-warning' : 'bg-muted/40 border-border text-muted-foreground';

  const dotColor =
    chainStatus.status === 'live' ? 'live-dot'
      : chainStatus.status === 'error' ? 'w-2 h-2 rounded-full bg-destructive flex-shrink-0'
      : chainStatus.status === 'stale' ? 'w-2 h-2 rounded-full bg-warning flex-shrink-0' : 'w-2 h-2 rounded-full bg-muted-foreground animate-pulse flex-shrink-0';

  const statusLabel =
    chainStatus.status === 'live' ? 'Robinhood Chain'
      : chainStatus.status === 'error' ? 'Connection Error'
      : chainStatus.status === 'stale' ? 'Stale Data' : 'Connecting…';

  return (
    <aside className={`fixed left-0 top-0 h-full z-40 flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className={`flex items-center h-20 border-b border-border px-3 ${collapsed ? 'justify-center' : 'justify-center'}`}>
        <AppLogo width={collapsed ? 40 : 150} height={collapsed ? 40 : 40} src="/assets/binara-wordmark.svg" className="flex-shrink-0" />
      </div>

      {!collapsed && (
        <div className={`mx-3 mt-3 px-3 py-2 rounded-lg border flex items-center gap-2 ${statusColor}`}>
          <div className={dotColor} />
          <span className="text-xs font-medium">{statusLabel}</span>
          {chainStatus.status === 'live' && <span className="ml-auto text-xs text-muted-foreground font-mono-nums">4663</span>}
        </div>
      )}
      {collapsed && <div className="flex justify-center mt-3"><div className={dotColor} /></div>}

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navGroups.map((group) => (
          <div key={`group-${group.title}`} className="mb-4">
            {!collapsed && <p className="px-2 mb-1 text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">{group.title}</p>}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={`nav-${item.label}`} href={item.href} title={collapsed ? item.label : undefined} className={`relative flex items-center gap-3 px-2 py-2 rounded-lg mb-0.5 transition-all duration-150 group ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'} ${collapsed ? 'justify-center' : ''}`}>
                  <Icon name={item.icon as Parameters<typeof Icon>[0]['name']} size={18} className={active ? 'text-primary' : ''} />
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium flex-1">{item.label}</span>
                      {item.isDemo && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60 font-medium">Soon</span>}
                      {item.badge !== undefined && !item.isDemo && <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold min-w-[20px] text-center">{item.badge}</span>}
                    </>
                  )}
                  {collapsed && item.badge !== undefined && !item.isDemo && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />}
                  {collapsed && <div className="absolute left-full ml-2 px-2 py-1 rounded-md bg-secondary border border-border text-xs text-foreground font-medium opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">{item.label}</div>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-border p-3 space-y-2">
          <p className="px-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50">Project</p>
          <a href={PROJECT_X_URL || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!PROJECT_X_URL} className={`flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${PROJECT_X_URL ? 'text-muted-foreground hover:text-foreground hover:bg-muted/60' : 'text-muted-foreground/40 cursor-default pointer-events-none'}`}>
            <span className="w-5 text-center text-sm font-semibold">𝕏</span>
            <span className="flex-1 font-medium">X / Twitter</span>
            <span className="text-[10px]">{PROJECT_X_URL ? '↗' : 'Soon'}</span>
          </a>
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-muted/30 border border-border/60">
            <Icon name="DocumentDuplicateIcon" size={15} className="text-muted-foreground/70" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Contract</p>
              <p className="text-[11px] font-mono text-muted-foreground truncate">{CONTRACT_ADDRESS || 'Not launched'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border p-2">
        <button suppressHydrationWarning onClick={onToggle} className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon name={collapsed ? 'ChevronRightIcon' : 'ChevronLeftIcon'} size={16} />
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
