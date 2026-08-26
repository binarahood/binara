import React from 'react';

const BINARA_URL = 'https://binarahood.xyz';
const METAMASK_URL = `https://metamask.app.link/dapp/${BINARA_URL.replace(/^https?:\/\//, '')}`;
const PHANTOM_URL = `https://phantom.app/ul/browse/${BINARA_URL}`;
const COINBASE_URL = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(BINARA_URL)}`;

const wallets = [
  { icon: '🦊', name: 'MetaMask', description: 'Open Binara in MetaMask Mobile', href: METAMASK_URL },
  { icon: '👻', name: 'Phantom', description: 'Open Binara in Phantom Mobile', href: PHANTOM_URL },
  { icon: '▣', name: 'Coinbase Wallet', description: 'Open Binara in Coinbase Wallet', href: COINBASE_URL },
];

export default function ConnectWalletPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="px-5 py-5 border-b border-border">
          <h1 className="text-xl font-semibold">Connect Wallet</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose a supported EVM wallet for Binara.</p>
        </div>
        <div className="p-4 space-y-3">
          {wallets.map((wallet) => (
            <a
              key={wallet.name}
              href={wallet.href}
              className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 active:bg-muted transition-colors"
            >
              <span className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center text-xl">{wallet.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">{wallet.name}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{wallet.description}</span>
              </span>
              <span className="text-muted-foreground text-lg">›</span>
            </a>
          ))}
        </div>
        <div className="px-5 pb-5 text-center">
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to Binara</a>
        </div>
      </section>
    </main>
  );
}
