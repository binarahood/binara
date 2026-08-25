'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

const items = [
  { label: 'Home', href: '/', icon: 'SquaresIcon' },
  { label: 'Pools', href: '/pool-scanner', icon: 'CircleStackIcon' },
  { label: 'Positions', href: '/positions', icon: 'ChartBarIcon' },
  { label: 'Scanner', href: '/scanner', icon: 'SignalIcon' },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-4 h-16">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon name={item.icon as Parameters<typeof Icon>[0]['name']} size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
