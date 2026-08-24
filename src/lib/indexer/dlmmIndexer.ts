/**
 * Ramses DLMM Indexer for Robinhood Chain (Chain ID 4663)
 *
 * Protocol: Ramses DLMM
 * Factory:  0xdcD5F77697914E27f56FD263EF82923C8524AbAc
 * Subgraph: https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql
 *
 * Data sources:
 *  1. Subgraph (primary) — pool list, swap history, volume, reserves
 *  2. Direct RPC (fallback / real-time) — active bin, current price, reserves
 *
 * This indexer is READ-ONLY. It never submits transactions.
 */

import { indexerStore, IndexedPool, IndexedSwap } from './store';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAIN_ID = 4663;
const FACTORY_ADDRESS = '0xdcD5F77697914E27f56FD263EF82923C8524AbAc';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

// Known quote assets on Robinhood Chain
const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

// Ramses DLMM Factory ABI fragments (minimal, for eth_call)
const FACTORY_ABI_GET_ALL_LB_PAIRS = '0x' + 'a0c7de0f'; // getAllLBPairs(tokenX, tokenY)
const FACTORY_ABI_GET_NUMBER_OF_LB_PAIRS = '0x' + '5b8e5e6e'; // getNumberOfLBPairs()

// LBPair ABI selectors (for eth_call)
const LBPAIR_GET_ACTIVE_ID = '0xd0c27c4f';       // getActiveId() returns (uint24)
const LBPAIR_GET_RESERVES = '0x0902f1ac';         // getReserves() returns (uint128, uint128)
const LBPAIR_GET_STATIC_FEE = '0x4b8a3529';       // getStaticFeeParameters()
const LBPAIR_TOKEN_X = '0x4f5dce83';              // getTokenX() returns (address)
const LBPAIR_TOKEN_Y = '0x273a8a2e';              // getTokenY() returns (address)
const LBPAIR_BIN_STEP = '0x6a1db1bf';             // getBinStep() returns (uint16)

// ERC20 ABI selectors
const ERC20_SYMBOL = '0x95d89b41';
const ERC20_DECIMALS = '0x313ce567';

// ─── RPC helpers ─────────────────────────────────────────────────────────────

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC: ${data.error.message}`);
  return data.result;
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcCall('eth_call', [{ to, data }, 'latest']);
  return result as string;
}

async function getBlockNumber(): Promise<number> {
  const hex = await rpcCall('eth_blockNumber');
  return parseInt(hex as string, 16);
}

// ─── ABI decode helpers ───────────────────────────────────────────────────────

function decodeUint256(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean || clean === '0'.repeat(64)) return 0n;
  return BigInt('0x' + clean.slice(0, 64));
}

function decodeAddress(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return '0x' + clean.slice(24, 64);
}

function decodeUint24(hex: string): number {
  return Number(decodeUint256(hex));
}

function decodeUint16(hex: string): number {
  return Number(decodeUint256(hex));
}

function decodeString(hex: string): string {
  try {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    // ABI encoded string: offset (32 bytes) + length (32 bytes) + data
    if (clean.length < 128) {
      // Try fixed bytes32 (some tokens use bytes32 for symbol)
      const bytes = Buffer.from(clean.slice(0, 64), 'hex');
      const str = bytes.toString('utf8').replace(/\0/g, '').trim();
      return str || '???';
    }
    const lengthHex = clean.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    if (length === 0 || length > 100) {
      // Try bytes32 fallback
      const bytes = Buffer.from(clean.slice(0, 64), 'hex');
      return bytes.toString('utf8').replace(/\0/g, '').trim() || '???';
    }
    const strHex = clean.slice(128, 128 + length * 2);
    return Buffer.from(strHex, 'hex').toString('utf8').trim() || '???';
  } catch {
    return '???';
  }
}

// ─── DLMM price formula ───────────────────────────────────────────────────────

/**
 * Ramses DLMM price formula (same as Trader Joe v2.1):
 * price(id) = (1 + binStep / 10000) ^ (id - 8388608)
 * Returns price of tokenX in tokenY units.
 */
function priceFromBinId(binId: number, binStep: number): number {
  const base = 1 + binStep / 10_000;
  const exponent = binId - 8_388_608;
  return Math.pow(base, exponent);
}

// ─── Token metadata ───────────────────────────────────────────────────────────

const tokenCache = new Map<string, { symbol: string; decimals: number }>();

async function getTokenMetadata(address: string): Promise<{ symbol: string; decimals: number }> {
  const addr = address.toLowerCase();
  if (tokenCache.has(addr)) return tokenCache.get(addr)!;

  // Known tokens
  if (addr === WETH_ADDRESS.toLowerCase()) {
    const meta = { symbol: 'WETH', decimals: 18 };
    tokenCache.set(addr, meta);
    return meta;
  }
  if (addr === USDG_ADDRESS.toLowerCase()) {
    const meta = { symbol: 'USDG', decimals: 18 };
    tokenCache.set(addr, meta);
    return meta;
  }

  try {
    const [symbolHex, decimalsHex] = await Promise.all([
      ethCall(address, ERC20_SYMBOL),
      ethCall(address, ERC20_DECIMALS),
    ]);
    const symbol = decodeString(symbolHex);
    const decimals = Number(decodeUint256(decimalsHex));
    const meta = { symbol: symbol || addr.slice(0, 6), decimals: decimals || 18 };
    tokenCache.set(addr, meta);
    return meta;
  } catch {
    const meta = { symbol: addr.slice(2, 8).toUpperCase(), decimals: 18 };
    tokenCache.set(addr, meta);
    return meta;
  }
}

// ─── Subgraph queries ─────────────────────────────────────────────────────────

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(`Subgraph: ${data.errors[0]?.message}`);
  return data.data;
}

// Fetch all DLMM pools from subgraph
async function fetchPoolsFromSubgraph(): Promise<SubgraphPool[]> {
  const query = `
    query GetPools($chainId: Int!, $limit: Int!, $offset: Int!) {
      DLMMPool(
        where: { chainId: { _eq: $chainId } }
        limit: $limit
        offset: $offset
        order_by: { createdAtTimestamp: asc }
      ) {
        id
        tokenX { id symbol decimals }
        tokenY { id symbol decimals }
        binStep
        activeId
        reserveX
        reserveY
        totalValueLockedUSD
        volumeUSD
        feesUSD
        txCount
        createdAtBlockNumber
        createdAtTimestamp
        isAlive
      }
    }
  `;

  const allPools: SubgraphPool[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, limit, offset }) as { DLMMPool?: SubgraphPool[] };
    const pools = data?.DLMMPool ?? [];
    allPools.push(...pools);
    if (pools.length < limit) break;
    offset += limit;
  }

  return allPools;
}

// Fetch recent swaps from subgraph
async function fetchRecentSwapsFromSubgraph(poolId: string, limit = 100): Promise<SubgraphSwap[]> {
  const query = `
    query GetSwaps($poolId: String!, $chainId: Int!, $limit: Int!) {
      DLMMSwap(
        where: { pool: { _eq: $poolId }, chainId: { _eq: $chainId } }
        limit: $limit
        order_by: { timestamp: desc }
      ) {
        id
        pool
        transaction
        timestamp
        blockNumber
        tokenIn
        tokenOut
        amountIn
        amountOut
        amountUSD
        activeBinId
      }
    }
  `;

  try {
    const data = await subgraphQuery(query, { poolId: poolId.toLowerCase(), chainId: CHAIN_ID, limit }) as { DLMMSwap?: SubgraphSwap[] };
    return data?.DLMMSwap ?? [];
  } catch {
    return [];
  }
}

// Fetch volume data per pool
async function fetchPoolVolumeFromSubgraph(poolId: string): Promise<SubgraphPoolVolume | null> {
  const now = Math.floor(Date.now() / 1000);
  const h1 = now - 3600;
  const h6 = now - 21600;
  const h24 = now - 86400;

  const query = `
    query GetPoolVolume($poolId: String!, $chainId: Int!, $h1: String!, $h6: String!, $h24: String!) {
      vol1h: DLMMSwap_aggregate(
        where: { pool: { _eq: $poolId }, chainId: { _eq: $chainId }, timestamp: { _gte: $h1 } }
      ) { aggregate { sum { amountUSD } count } }
      vol6h: DLMMSwap_aggregate(
        where: { pool: { _eq: $poolId }, chainId: { _eq: $chainId }, timestamp: { _gte: $h6 } }
      ) { aggregate { sum { amountUSD } count } }
      vol24h: DLMMSwap_aggregate(
        where: { pool: { _eq: $poolId }, chainId: { _eq: $chainId }, timestamp: { _gte: $h24 } }
      ) { aggregate { sum { amountUSD } count } }
    }
  `;

  try {
    const data = await subgraphQuery(query, {
      poolId: poolId.toLowerCase(),
      chainId: CHAIN_ID,
      h1: String(h1),
      h6: String(h6),
      h24: String(h24),
    }) as SubgraphPoolVolume;
    return data;
  } catch {
    return null;
  }
}

// ─── Subgraph types ───────────────────────────────────────────────────────────

interface SubgraphToken {
  id: string;
  symbol: string;
  decimals: number;
}

interface SubgraphPool {
  id: string;
  tokenX: SubgraphToken;
  tokenY: SubgraphToken;
  binStep: number;
  activeId: number | null;
  reserveX: string;
  reserveY: string;
  totalValueLockedUSD: string | null;
  volumeUSD: string | null;
  feesUSD: string | null;
  txCount: number;
  createdAtBlockNumber: number;
  createdAtTimestamp: number;
  isAlive: boolean;
}

interface SubgraphSwap {
  id: string;
  pool: string;
  transaction: string;
  timestamp: number;
  blockNumber: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  amountUSD: string | null;
  activeBinId: number;
}

interface SubgraphPoolVolume {
  vol1h?: { aggregate?: { sum?: { amountUSD?: string | null }; count?: number } };
  vol6h?: { aggregate?: { sum?: { amountUSD?: string | null }; count?: number } };
  vol24h?: { aggregate?: { sum?: { amountUSD?: string | null }; count?: number } };
}

// ─── Pool enrichment via RPC ──────────────────────────────────────────────────

async function enrichPoolFromRPC(pool: IndexedPool): Promise<Partial<IndexedPool>> {
  try {
    const activeIdHex = await ethCall(pool.address, LBPAIR_GET_ACTIVE_ID);
    const activeBin = decodeUint24(activeIdHex);
    let currentPrice = priceFromBinId(activeBin, pool.binStep);

    let reserveX = pool.reserveX;
    let reserveY = pool.reserveY;

    try {
      const reservesHex = await ethCall(pool.address, LBPAIR_GET_RESERVES);
      // Returns (uint128 reserveX, uint128 reserveY) — two 32-byte slots
      const clean = reservesHex.startsWith('0x') ? reservesHex.slice(2) : reservesHex;
      reserveX = BigInt('0x' + clean.slice(0, 64)).toString();
      reserveY = BigInt('0x' + clean.slice(64, 128)).toString();
    } catch { /* use existing */ }

    return { activeBin, currentPrice, reserveX, reserveY, updatedAt: Date.now() };
  } catch {
    return {};
  }
}

// ─── Analytics scoring ────────────────────────────────────────────────────────

function computeAnalytics(pool: IndexedPool): Partial<IndexedPool> {
  const vol24h = pool.volumeUSD24h ?? pool.volume24h;
  const tvl = pool.tvl ?? 0;
  const volumeToTVL = tvl > 0 ? vol24h / tvl : 0;

  // Estimate APR from fees: fee% * volume24h * 365 / tvl
  const estimatedAPR = tvl > 0 && vol24h > 0
    ? (pool.fee / 100) * vol24h * 365 / tvl * 100
    : null;

  // Risk level based on volatility and bin step
  let riskLevel: IndexedPool['riskLevel'] = 'LOW';
  if (pool.binStep >= 20) riskLevel = 'HIGH';
  else if (pool.binStep >= 10) riskLevel = 'MEDIUM';
  else if (pool.binStep >= 5) riskLevel = 'LOW';

  // Analytics score (0-100)
  let score = 50;
  if (volumeToTVL > 5) score += 20;
  else if (volumeToTVL > 2) score += 10;
  if (tvl > 100_000) score += 15;
  else if (tvl > 10_000) score += 8;
  if (pool.swapCount24h > 100) score += 10;
  else if (pool.swapCount24h > 10) score += 5;
  if (pool.status === 'active') score += 5;
  score = Math.min(100, Math.max(0, score));

  return {
    volumeToTVL,
    estimatedAPR,
    riskLevel,
    analyticsScore: score,
  };
}

// ─── Main indexer ─────────────────────────────────────────────────────────────

let indexerRunning = false;
let lastFullSyncAt = 0;
const FULL_SYNC_INTERVAL_MS = 60_000; // Re-sync pools every 60s

export async function runIndexer(): Promise<void> {
  if (indexerRunning) return;
  indexerRunning = true;

  indexerStore.setState({
    status: 'indexing',
    startedAt: Date.now(),
    error: null,
  });

  try {
    await syncPools();
    await syncRecentSwaps();

    const blockNumber = await getBlockNumber();
    indexerStore.setState({
      status: 'live',
      lastIndexedBlock: blockNumber,
      lastIndexedTimestamp: Date.now(),
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Indexer error';
    indexerStore.setState({ status: 'error', error: msg });
  } finally {
    indexerRunning = false;
  }
}

export async function syncPools(): Promise<void> {
  const now = Date.now();
  if (now - lastFullSyncAt < FULL_SYNC_INTERVAL_MS && indexerStore.getAllPools().length > 0) {
    // Only do RPC enrichment for existing pools
    await enrichExistingPools();
    return;
  }
  lastFullSyncAt = now;

  // Try subgraph first
  let subgraphPools: SubgraphPool[] = [];
  let subgraphAvailable = false;

  try {
    subgraphPools = await fetchPoolsFromSubgraph();
    subgraphAvailable = true;
  } catch {
    // Subgraph unavailable — fall back to factory RPC scan
    subgraphAvailable = false;
  }

  if (subgraphAvailable && subgraphPools.length > 0) {
    await processPools(subgraphPools);
  } else {
    // Subgraph unavailable — try direct factory scan via RPC
    await scanFactoryViaRPC();
  }
}

async function processPools(subgraphPools: SubgraphPool[]): Promise<void> {
  for (const sp of subgraphPools) {
    try {
      const symbolA = sp.tokenX.symbol || '???';
      const symbolB = sp.tokenY.symbol || '???';
      const decimalsA = sp.tokenX.decimals || 18;
      const decimalsB = sp.tokenY.decimals || 18;

      // Base fee from bin step (Ramses DLMM: base fee ≈ binStep * 0.01%)
      // Actual fee is dynamic but we use the static base as a floor
      const baseFeePercent = sp.binStep * 0.01; // e.g. binStep=5 → 0.05%

      const tvlUSD = sp.totalValueLockedUSD ? parseFloat(sp.totalValueLockedUSD) : null;
      const vol24hUSD = sp.volumeUSD ? parseFloat(sp.volumeUSD) : null;

      // Active bin and price
      let activeBin = sp.activeId ?? null;
      let currentPrice: number | null = null;
      if (activeBin !== null) {
        currentPrice = priceFromBinId(activeBin, sp.binStep);
      }

      const existing = indexerStore.getPool(sp.id);

      const pool: IndexedPool = {
        address: sp.id,
        protocol: 'Ramses DLMM',
        pid: 0,
        tokenA: sp.tokenX.id,
        tokenB: sp.tokenY.id,
        symbolA,
        symbolB,
        decimalsA,
        decimalsB,
        pair: `${symbolA}/${symbolB}`,
        binStep: sp.binStep,
        activeBin,
        currentPrice,
        fee: baseFeePercent,
        reserveX: sp.reserveX || '0',
        reserveY: sp.reserveY || '0',
        tvl: tvlUSD,
        volume1m: 0,
        volume5m: 0,
        volume15m: 0,
        volume1h: 0,
        volume6h: 0,
        volume24h: 0,
        volumeUSD1h: null,
        volumeUSD6h: null,
        volumeUSD24h: vol24hUSD,
        volumeToTVL: tvlUSD && vol24hUSD ? vol24hUSD / tvlUSD : 0,
        volatility: sp.binStep * 0.5, // rough proxy
        analyticsScore: 50,
        riskLevel: 'LOW',
        estimatedAPR: null,
        priceChange24h: null,
        timeInRange: null,
        swapCount24h: sp.txCount || 0,
        swapCount1h: 0,
        status: sp.isAlive ? 'active' : 'inactive',
        createdBlock: sp.createdAtBlockNumber || 0,
        createdTimestamp: sp.createdAtTimestamp || 0,
        updatedAt: Date.now(),
      };

      // Preserve price change from previous data
      if (existing?.currentPrice && currentPrice) {
        pool.priceChange24h = ((currentPrice - existing.currentPrice) / existing.currentPrice) * 100;
      }

      // Apply analytics
      const analytics = computeAnalytics(pool);
      Object.assign(pool, analytics);

      indexerStore.upsertPool(pool);
    } catch {
      // Skip individual pool errors
    }
  }

  // Enrich with volume data from subgraph
  await enrichVolumeFromSubgraph();
}

async function enrichVolumeFromSubgraph(): Promise<void> {
  const pools = indexerStore.getAllPools();
  // Process in batches to avoid overwhelming the subgraph
  const batchSize = 5;
  for (let i = 0; i < pools.length; i += batchSize) {
    const batch = pools.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (pool) => {
        try {
          const volData = await fetchPoolVolumeFromSubgraph(pool.address);
          if (!volData) return;

          const vol1h = parseFloat(volData.vol1h?.aggregate?.sum?.amountUSD ?? '0') || 0;
          const vol6h = parseFloat(volData.vol6h?.aggregate?.sum?.amountUSD ?? '0') || 0;
          const vol24h = parseFloat(volData.vol24h?.aggregate?.sum?.amountUSD ?? '0') || 0;
          const swapCount1h = volData.vol1h?.aggregate?.count ?? 0;
          const swapCount24h = volData.vol24h?.aggregate?.count ?? pool.swapCount24h;

          const updated: IndexedPool = {
            ...pool,
            volumeUSD1h: vol1h || null,
            volumeUSD6h: vol6h || null,
            volumeUSD24h: vol24h || null,
            swapCount1h,
            swapCount24h,
            updatedAt: Date.now(),
          };

          // Recompute derived metrics
          const analytics = computeAnalytics(updated);
          Object.assign(updated, analytics);

          indexerStore.upsertPool(updated);
        } catch { /* skip */ }
      })
    );
  }
}

async function enrichExistingPools(): Promise<void> {
  const pools = indexerStore.getAllPools();
  const batchSize = 3;
  for (let i = 0; i < pools.length; i += batchSize) {
    const batch = pools.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (pool) => {
        try {
          const rpcData = await enrichPoolFromRPC(pool);
          const updated = { ...pool, ...rpcData };
          const analytics = computeAnalytics(updated);
          indexerStore.upsertPool({ ...updated, ...analytics });
        } catch { /* skip */ }
      })
    );
  }
}

async function syncRecentSwaps(): Promise<void> {
  const pools = indexerStore.getAllPools();
  const batchSize = 3;

  for (let i = 0; i < pools.length; i += batchSize) {
    const batch = pools.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (pool) => {
        try {
          const swaps = await fetchRecentSwapsFromSubgraph(pool.address, 50);
          for (const s of swaps) {
            const swap: IndexedSwap = {
              poolAddress: pool.address,
              txHash: s.transaction,
              blockNumber: s.blockNumber,
              timestamp: s.timestamp,
              tokenIn: s.tokenIn,
              tokenOut: s.tokenOut,
              amountIn: s.amountIn,
              amountOut: s.amountOut,
              activeBinAfter: s.activeBinId,
              price: s.activeBinId ? priceFromBinId(s.activeBinId, pool.binStep) : null,
              volumeUSD: s.amountUSD ? parseFloat(s.amountUSD) : null,
            };
            indexerStore.addSwap(swap);
          }
        } catch { /* skip */ }
      })
    );
  }
}

// Fallback: scan factory via direct RPC when subgraph is unavailable
async function scanFactoryViaRPC(): Promise<void> {
  // This is a best-effort fallback. Without the subgraph we can only
  // check known pools or scan logs for LBPairCreated events.
  // For now, we mark the indexer as running but with no pools discovered.
  // The subgraph is the primary data source.
  indexerStore.setState({
    error: 'Subgraph unavailable. Waiting for subgraph to come online.',
  });
}

// ─── Incremental update (called on each new block) ────────────────────────────

export async function onNewBlock(blockNumber: number): Promise<{
  updatedPools: string[];
  newSwaps: IndexedSwap[];
}> {
  const updatedPools: string[] = [];
  const newSwaps: IndexedSwap[] = [];

  try {
    // Enrich active pools with latest RPC data
    const pools = indexerStore.getAllPools().filter((p) => p.status === 'active');
    const batchSize = 5;

    for (let i = 0; i < pools.length; i += batchSize) {
      const batch = pools.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (pool) => {
          const rpcData = await enrichPoolFromRPC(pool);
          if (Object.keys(rpcData).length > 0) {
            const updated = { ...pool, ...rpcData };
            const analytics = computeAnalytics(updated);
            indexerStore.upsertPool({ ...updated, ...analytics });
            updatedPools.push(pool.address);
          }
        })
      );
      results; // consumed
    }

    indexerStore.setState({
      lastIndexedBlock: blockNumber,
      lastIndexedTimestamp: Date.now(),
      status: 'live',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Block processing error';
    indexerStore.setState({ error: msg });
  }

  return { updatedPools, newSwaps };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { FACTORY_ADDRESS, SUBGRAPH_URL, CHAIN_ID, priceFromBinId };
