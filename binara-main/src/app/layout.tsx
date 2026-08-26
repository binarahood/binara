import React from 'react';
import { connection } from 'next/server';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'BINARA — DLMM Liquidity Intelligence',
  description:
    'BINARA is a DLMM liquidity intelligence platform for Robinhood Chain. Real-time pool analytics, DLMM pool discovery, and liquidity distribution analysis.',
  applicationName: 'BINARA',
  openGraph: {
    title: 'BINARA — DLMM Liquidity Intelligence',
    description: 'BINARA is a DLMM liquidity intelligence platform for Robinhood Chain.',
    type: 'website',
  },
  icons: {
    icon: [{ url: '/assets/binara-wordmark.svg', type: 'image/svg+xml' }],
  },
};

const mobileWalletRedirect = `
(function () {
  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      ('ontouchstart' in window && window.innerWidth < 1024);
  }
  document.addEventListener('click', function (event) {
    if (!isMobile()) return;
    var target = event.target;
    var button = target && target.closest ? target.closest('button') : null;
    if (!button) return;
    var label = (button.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!label.includes('Connect Wallet')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign('/connect-wallet');
  }, true);
})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className={GeistSans.className}>
        <script dangerouslySetInnerHTML={{ __html: mobileWalletRedirect }} />
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            },
          }}
        />
      </body>
    </html>
  );
}
