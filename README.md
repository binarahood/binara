# BINARA

**DLMM Liquidity Infrastructure on Robinhood Chain**

BINARA is a DLMM liquidity intelligence platform built for Robinhood Chain.

## Current Focus

- Real-time pool analytics
- DLMM pool discovery
- Liquidity distribution analysis
- Position monitoring
- Volume and liquidity analytics
- Robinhood Chain infrastructure
- Optional GMGN token intelligence (server-side)

## Current Data Architecture

- Robinhood Chain RPC + Ramses DLMM subgraph for pool state
- GeckoTerminal for verified market data and fallback reserve USD
- ERC-20 on-chain metadata for token symbols
- Optional GMGN token intelligence for token metadata and market signals

When enabled, GMGN is accessed only from server-side code through the `GMGN_API_KEY` environment variable. The API key must never be exposed to client-side code or committed to the repository.

## 🚀 Features

- **Next.js 15** - Latest version with improved performance and features
- **React 19** - Latest React version with enhanced capabilities
- **Tailwind CSS** - Utility-first CSS framework for rapid development
- **Robinhood Chain** - Chain ID 4663, Ramses DLMM integration
- **Live Data** - WebSocket/SSE infrastructure for real-time pool updates

## 🛠️ Installation

1. Install dependencies:
  ```bash
  npm install
  # or
  yarn install
  ```

2. Start the development server:
  ```bash
  npm run dev
  # or
  yarn dev
  ```
3. Open [http://localhost:4028](http://localhost:4028) with your browser to see the result.

## 📁 Project Structure

```
nextjs/
├── public/             # Static assets
├── src/
│   ├── app/            # App router components
│   │   ├── layout.tsx  # Root layout component
│   │   └── page.tsx    # Main page component
│   ├── components/     # Reusable components
│   ├── lib/            # Indexer, types, utilities, integrations
│   ├── hooks/          # Live data hooks
│   ├── styles/         # Global styles and Tailwind configuration
├── next.config.mjs     # Next.js configuration
├── package.json        # Project dependencies and scripts
├── postcss.config.js   # PostCSS configuration
└── tailwind.config.js  # Tailwind CSS configuration
```

## 📦 Available Scripts

- `npm run dev` - Start the development server on port 4028
- `npm run build` - Build the application for production
- `npm run start` - Start the development server
- `npm run lint` - Run ESLint to check code quality

## 📱 Deployment

Build the application for production:

  ```bash
  npm run build
  ```

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)

Built with ❤️ on Rocket.new