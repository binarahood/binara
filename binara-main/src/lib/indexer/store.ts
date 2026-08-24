/**
 * In-memory store for indexed Robinhood Chain DLMM pool data.
 * Acts as the database layer — no external DB required.
 * All data is sourced from real on-chain events via the Ramses DLMM subgraph
 * and direct RPC calls to Robinhood Chain (Chain ID 4663).
 */

export interface IndexedPool {
  // Identity
  address: string;
  protocol: 'Ramses DLMM';
  pid: number;

  // Token pair
  tokenA: string;        // tokenX address
  tokenB: string;        // tokenY address
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
  pair: string;          // e.g. "WETH/USDG"

  // DLMM params
  binStep: number;
  activeBin: number | null;
  currentPrice: number | null;  // price of tokenX in tokenY units
  fee: number;           // base fee in % (e.g. 0.04 for 4bps)

  // Liquidity / TVL
  reserveX: string;      // raw bigint string
  reserveY: string;
  tvl: number | null;    // USD if price available, else null

  // Volume aggregates (USD if available, else token amounts)
  volume1m: number;
  volume5m: number;
  volume15m: number;
  volume1h: number;
  volume6h: number;
  volume24h: number;
  volumeUSD1h: number | null;
  volumeUSD6h: number | null;
  volumeUSD24h: number | null;

  // Derived metrics
  volumeToTVL: number;
  volatility: number;
  analyticsScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  estimatedAPR: number | null;
  priceChange24h: number | null;
  timeInRange: number | null;

  // Activity
  swapCount24h: number;
  swapCount1h: number;
  status: 'active' | 'inactive';

  // Timestamps
  createdBlock: number;
  createdTimestamp: number;
  updatedAt: number;
}

export interface IndexedSwap {
  poolAddress: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  activeBinAfter: number;
  price: number | null;
  volumeUSD: number | null;
}

export interface VolumeAggregate {
  poolAddress: string;
  windowMs: number;  // 60000, 300000, 900000, 3600000, 21600000, 86400000
  volume: number;
  volumeUSD: number | null;
  swapCount: number;
  updatedAt: number;
}

export interface LiquiditySnapshot {
  poolAddress: string;
  timestamp: number;
  reserveX: string;
  reserveY: string;
  activeBin: number | null;
  tvl: number | null;
}

export interface IndexerState {
  status: 'idle' | 'indexing' | 'live' | 'error';
  lastIndexedBlock: number;
  lastIndexedTimestamp: number;
  poolsDiscovered: number;
  swapsIndexed: number;
  error: string | null;
  startedAt: number;
  protocol: string;
  factoryAddress: string;
  subgraphEndpoint: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

class IndexerStore {
  private pools: Map<string, IndexedPool> = new Map();
  private swaps: IndexedSwap[] = [];
  private liquiditySnapshots: LiquiditySnapshot[] = [];
  private state: IndexerState = {
    status: 'idle',
    lastIndexedBlock: 0,
    lastIndexedTimestamp: 0,
    poolsDiscovered: 0,
    swapsIndexed: 0,
    error: null,
    startedAt: 0,
    protocol: 'Ramses DLMM',
    factoryAddress: '0xdcD5F77697914E27f56FD263EF82923C8524AbAc',
    subgraphEndpoint: 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql',
  };

  // Pool CRUD
  upsertPool(pool: IndexedPool): void {
    this.pools.set(pool.address.toLowerCase(), pool);
    this.state.poolsDiscovered = this.pools.size;
  }

  getPool(address: string): IndexedPool | undefined {
    return this.pools.get(address.toLowerCase());
  }

  getAllPools(): IndexedPool[] {
    return Array.from(this.pools.values());
  }

  // Swap storage (keep last 10000)
  addSwap(swap: IndexedSwap): void {
    this.swaps.push(swap);
    if (this.swaps.length > 10_000) {
      this.swaps = this.swaps.slice(-10_000);
    }
    this.state.swapsIndexed++;
  }

  getSwapsForPool(poolAddress: string, sinceMs?: number): IndexedSwap[] {
    const addr = poolAddress.toLowerCase();
    const cutoff = sinceMs ? Date.now() - sinceMs : 0;
    return this.swaps.filter(
      (s) => s.poolAddress.toLowerCase() === addr && s.timestamp * 1000 >= cutoff
    );
  }

  getRecentSwaps(limit = 50): IndexedSwap[] {
    return this.swaps.slice(-limit).reverse();
  }

  // Liquidity snapshots (keep last 1000 per pool)
  addLiquiditySnapshot(snap: LiquiditySnapshot): void {
    this.liquiditySnapshots.push(snap);
    if (this.liquiditySnapshots.length > 50_000) {
      this.liquiditySnapshots = this.liquiditySnapshots.slice(-50_000);
    }
  }

  // State management
  setState(update: Partial<IndexerState>): void {
    this.state = { ...this.state, ...update };
  }

  getState(): IndexerState {
    return { ...this.state };
  }

  // Volume computation for a pool over a time window
  computeVolume(poolAddress: string, windowMs: number): { volume: number; volumeUSD: number | null; swapCount: number } {
    const swaps = this.getSwapsForPool(poolAddress, windowMs);
    let volume = 0;
    let volumeUSD = 0;
    let hasUSD = false;

    for (const swap of swaps) {
      // Use raw token amounts as proxy volume (in tokenX units)
      const amtIn = parseFloat(swap.amountIn) || 0;
      volume += amtIn;
      if (swap.volumeUSD !== null) {
        volumeUSD += swap.volumeUSD;
        hasUSD = true;
      }
    }

    return {
      volume,
      volumeUSD: hasUSD ? volumeUSD : null,
      swapCount: swaps.length,
    };
  }
}

// Singleton
export const indexerStore = new IndexerStore();
