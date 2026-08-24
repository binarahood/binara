/**
 * Ramses DLMM Indexer V9 for Robinhood Chain (Chain ID 4663)
 *
 * Goals of V9:
 *  - Fast first discovery from the subgraph.
 *  - Direct RPC enrichment only for USDG pools (the pools where we can
 *    calculate a conservative USD TVL without inventing a USD price).
 *  - Keep live on-chain reserves/active-bin data separate from subgraph data.
 *  - Never replace a valid subgraph TVL with N/A just because an RPC call
 *    returns zero reserves or reverts.
 *  - Avoid fetching 50 swaps for every pool on every API request.
 *  - Use bounded concurrency so Vercel/RPC is not flooded.
 *
 * This indexer is READ-ONLY. It never submits transactions.
 */

import { indexerStore, IndexedPool, IndexedSwap } from './store';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAIN_ID = 4663;
const FACTORY_ADDRESS = '0xdcD5F77697914E27f56FD263EF82923C8524AbAc';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const USDG_USD_PRICE = 1;

const FACTORY_GET_NUMBER_OF_LB_PAIRS = '0x4e937c3a';
const FACTORY_GET_LB_PAIR_AT_INDEX = '0x7daf5d66';

const LBPAIR_GET_ACTIVE_ID = '0xdbe65edc';
const LBPAIR_GET_RESERVES = '0x0902f1ac';
const LBPAIR_TOKEN_X = '0x05e8746d';
const LBPAIR_TOKEN_Y = '0xda10610c';
const LBPAIR_BIN_STEP = '0x17f11ecc';

const ERC20_SYMBOL = '0x95d89b41';
const ERC20_DECIMALS = '0x313ce567';

// Tunable, but safe defaults for Vercel/serverless.
const DISCOVERY_INTERVAL_MS = 5 * 60_000;
const RPC_REFRESH_INTERVAL_MS = 20_000;
const VOLUME_REFRESH_INTERVAL_MS = 60_000;
const SWAP_REFRESH_INTERVAL_MS = 5 * 60_000;

const RPC_CONCURRENCY = Math.max(1, Number(process.env.DLMM_RPC_CONCURRENCY || 10));
const SUBGRAPH_CONCURRENCY = Math.max(1, Number(process.env.DLMM_SUBGRAPH_CONCURRENCY || 12));
const MAX_USDG_RPC_POOLS = Math.max(1, Number(process.env.DLMM_MAX_USDG_RPC_POOLS || 100));
const MAX_SWAPS_POOLS = Math.max(0, Number(process.env.DLMM_MAX_SWAP_POOLS || 30));
const MAX_FACTORY_POOLS = Math.max(1, Number(process.env.DLMM_MAX_POOLS || 200));
const FACTORY_CONCURRENCY = Math.max(1, Number(process.env.DLMM_FACTORY_CONCURRENCY || 8));

// ─── Process-local state ──────────────────────────────────────────────────────

let indexerRunning = false;
let lastDiscoveryAt = 0;
let lastRpcRefreshAt = 0;
let lastVolumeRefreshAt = 0;
let lastSwapRefreshAt = 0;

// ─── Generic bounded concurrency ───────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch {
        // Individual failures must not abort the complete scan.
      }
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

// ─── RPC ───────────────────────────────────────────────────────────────────────

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);

  const data = await res.json() as {
    result?: unknown;
    error?: { message?: string };
  };

  if (data.error) throw new Error(`RPC: ${data.error.message || 'Unknown error'}`);
  return data.result;
}

async function ethCall(to: string, data: string): Promise<string> {
  return String(await rpcCall('eth_call', [{ to, data }, 'latest']));
}

async function getBlockNumber(): Promise<number> {
  const hex = String(await rpcCall('eth_blockNumber'));
  return parseInt(hex, 16);
}

// ─── ABI decoders ──────────────────────────────────────────────────────────────

function cleanHex(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function decodeUint256(hex: string): bigint {
  const clean = cleanHex(hex);
  if (!clean) return 0n;
  const word = clean.slice(0, 64).padStart(64, '0');
  return BigInt(`0x${word}`);
}

function decodeUint24(hex: string): number {
  return Number(decodeUint256(hex));
}

function decodeUint16(hex: string): number {
  return Number(decodeUint256(hex));
}

function decodeAddress(hex: string): string {
  const clean = cleanHex(hex);
  if (clean.length < 64) throw new Error('Invalid address ABI result');
  return `0x${clean.slice(24, 64)}`;
}

function decodeString(hex: string): string {
  try {
    const clean = cleanHex(hex);
    if (clean.length < 128) {
      return Buffer.from(clean.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim() || '???';
    }

    const length = parseInt(clean.slice(64, 128), 16);
    if (!Number.isFinite(length) || length <= 0 || length > 100) {
      return Buffer.from(clean.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim() || '???';
    }

    return Buffer.from(clean.slice(128, 128 + length * 2), 'hex')
      .toString('utf8')
      .replace(/\0/g, '')
      .trim() || '???';
  } catch {
    return '???';
  }
}

function decodeReserves(hex: string): { reserveX: string; reserveY: string } {
  const clean = cleanHex(hex);
  // getReserves() returns two 32-byte ABI words in the observed RPC response.
  if (clean.length < 128) throw new Error(`Invalid getReserves response length: ${clean.length}`);

  return {
    reserveX: BigInt(`0x${clean.slice(0, 64)}`).toString(),
    reserveY: BigInt(`0x${clean.slice(64, 128)}`).toString(),
  };
}

// ─── DLMM price ────────────────────────────────────────────────────────────────

function rawPriceFromBinId(binId: number, binStep: number): number {
  if (!Number.isFinite(binId) || !Number.isFinite(binStep) || binStep < 0) return 0;
  const base = 1 + binStep / 10_000;
  const exponent = binId - 8_388_608;
  const raw = Math.pow(base, exponent);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function priceFromBinId(
  binId: number,
  binStep: number,
  decimalsX = 18,
  decimalsY = 18,
): number {
  const raw = rawPriceFromBinId(binId, binStep);
  if (!raw) return 0;

  const scale = 10 ** (decimalsX - decimalsY);
  const human = raw * scale;
  return Number.isFinite(human) && human > 0 ? human : 0;
}

// ─── Token metadata ────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { symbol: string; decimals: number }>();

async function getTokenMetadata(address: string): Promise<{ symbol: string; decimals: number }> {
  const key = address.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached) return cached;

  if (key === WETH_ADDRESS.toLowerCase()) {
    const meta = { symbol: 'WETH', decimals: 18 };
    tokenCache.set(key, meta);
    return meta;
  }

  if (key === USDG_ADDRESS.toLowerCase()) {
    const meta = { symbol: 'USDG', decimals: 6 };
    tokenCache.set(key, meta);
    return meta;
  }

  try {
    const [symbolHex, decimalsHex] = await Promise.all([
      ethCall(address, ERC20_SYMBOL),
      ethCall(address, ERC20_DECIMALS),
    ]);

    const decimals = Number(decodeUint256(decimalsHex));
    const meta = {
      symbol: decodeString(symbolHex),
      decimals: Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18,
    };

    tokenCache.set(key, meta);
    return meta;
  } catch {
    const meta = { symbol: key.slice(2, 8).toUpperCase(), decimals: 18 };
    tokenCache.set(key, meta);
    return meta;
  }
}

// ─── Subgraph ──────────────────────────────────────────────────────────────────

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

async function subgraphQuery(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<unknown> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);

  const data = await res.json() as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  };

  if (data.errors?.length) {
    throw new Error(`Subgraph: ${data.errors[0]?.message || 'Unknown error'}`);
  }

  return data.data;
}

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
  const limit = 100;
  let offset = 0;

  while (true) {
    const data = await subgraphQuery(query, {
      chainId: CHAIN_ID,
      limit,
      offset,
    }) as { DLMMPool?: SubgraphPool[] };

    const pools = data.DLMMPool ?? [];
    allPools.push(...pools);
    if (pools.length < limit) break;
    offset += limit;
  }

  return allPools;
}

async function fetchPoolVolumeFromSubgraph(poolId: string): Promise<SubgraphPoolVolume | null> {
  const now = Math.floor(Date.now() / 1000);
  const query = `
    query GetPoolVolume($poolId: String!, $chainId: Int!, $h1: Int!, $h6: Int!, $h24: Int!) {
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
    return await subgraphQuery(query, {
      poolId: poolId.toLowerCase(),
      chainId: CHAIN_ID,
      h1: now - 3600,
      h6: now - 21600,
      h24: now - 86400,
    }) as SubgraphPoolVolume;
  } catch {
    return null;
  }
}

async function fetchRecentSwapsFromSubgraph(poolId: string, limit = 50): Promise<SubgraphSwap[]> {
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
    const data = await subgraphQuery(query, {
      poolId: poolId.toLowerCase(),
      chainId: CHAIN_ID,
      limit,
    }) as { DLMMSwap?: SubgraphSwap[] };
    return data.DLMMSwap ?? [];
  } catch {
    return [];
  }
}

// ─── TVL / USDG valuation ──────────────────────────────────────────────────────

function isUSDGToken(address: string): boolean {
  return address.toLowerCase() === USDG_ADDRESS.toLowerCase();
}

function humanReserve(raw: string, decimals: number): number {
  try {
    const n = Number(BigInt(raw || '0'));
    const value = n / 10 ** decimals;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function priceFromUSDGReserveRatio(
  tokenX: string,
  tokenY: string,
  decimalsX: number,
  decimalsY: number,
  reserveX: string,
  reserveY: string,
): number {
  const x = humanReserve(reserveX, decimalsX);
  const y = humanReserve(reserveY, decimalsY);
  if (x <= 0 || y <= 0) return 0;

  const isXUSDG = isUSDGToken(tokenX);
  const isYUSDG = isUSDGToken(tokenY);

  if (isYUSDG && !isXUSDG) return y / x;
  if (isXUSDG && !isYUSDG) return x / y;
  return 0;
}

interface TvlEstimate {
  tvl: number | null;
  priceXInY: number;
  source: 'bin' | 'reserve-ratio' | 'stable-side-only' | 'none';
}

function estimateTvlFromUSDG(
  tokenX: string,
  tokenY: string,
  decimalsX: number,
  decimalsY: number,
  reserveX: string,
  reserveY: string,
  binPriceXInY: number,
): TvlEstimate {
  const x = humanReserve(reserveX, decimalsX);
  const y = humanReserve(reserveY, decimalsY);

  const isXUSDG = isUSDGToken(tokenX);
  const isYUSDG = isUSDGToken(tokenY);
  if (!isXUSDG && !isYUSDG) return { tvl: null, priceXInY: 0, source: 'none' };
  if (x <= 0 && y <= 0) return { tvl: null, priceXInY: 0, source: 'none' };

  let priceXInY = Number.isFinite(binPriceXInY) && binPriceXInY > 0 ? binPriceXInY : 0;
  let source: TvlEstimate['source'] = priceXInY > 0 ? 'bin' : 'none';

  if (priceXInY <= 0) {
    priceXInY = priceFromUSDGReserveRatio(
      tokenX,
      tokenY,
      decimalsX,
      decimalsY,
      reserveX,
      reserveY,
    );
    if (priceXInY > 0) source = 'reserve-ratio';
  }

  if (isYUSDG && !isXUSDG) {
    if (priceXInY > 0) {
      const value = x * priceXInY + y * USDG_USD_PRICE;
      if (Number.isFinite(value) && value > 0) return { tvl: value, priceXInY, source };
    }
    return y > 0
      ? { tvl: y * USDG_USD_PRICE, priceXInY: 0, source: 'stable-side-only' }
      : { tvl: null, priceXInY: 0, source: 'none' };
  }

  if (isXUSDG && !isYUSDG) {
    if (priceXInY > 0) {
      const tokenYPriceUSD = 1 / priceXInY;
      const value = x * USDG_USD_PRICE + y * tokenYPriceUSD;
      if (Number.isFinite(value) && value > 0) return { tvl: value, priceXInY, source };
    }
    return x > 0
      ? { tvl: x * USDG_USD_PRICE, priceXInY: 0, source: 'stable-side-only' }
      : { tvl: null, priceXInY: 0, source: 'none' };
  }

  return { tvl: null, priceXInY: 0, source: 'none' };
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function computeAnalytics(pool: IndexedPool): Partial<IndexedPool> {
  const vol24h = pool.volumeUSD24h ?? pool.volume24h ?? 0;
  const tvl = pool.tvl ?? 0;
  const volumeToTVL = tvl > 0 ? vol24h / tvl : 0;

  const estimatedAPR = tvl > 0 && vol24h > 0
    ? (pool.fee / 100) * vol24h * 365 / tvl * 100
    : null;

  const riskLevel: IndexedPool['riskLevel'] =
    pool.binStep >= 20 ? 'HIGH' : pool.binStep >= 10 ? 'MEDIUM' : 'LOW';

  let score = 50;
  if (volumeToTVL > 5) score += 20;
  else if (volumeToTVL > 2) score += 10;
  if (tvl > 100_000) score += 15;
  else if (tvl > 10_000) score += 8;
  if (pool.swapCount24h > 100) score += 10;
  else if (pool.swapCount24h > 10) score += 5;
  if (pool.status === 'active') score += 5;

  return {
    volumeToTVL,
    estimatedAPR,
    riskLevel,
    analyticsScore: Math.min(100, Math.max(0, score)),
  };
}

// ─── Pool construction ────────────────────────────────────────────────────────

function parsePositiveNumber(value: string | null): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildPoolFromSubgraph(sp: SubgraphPool): IndexedPool {
  const existing = indexerStore.getPool(sp.id);
  const decimalsA = Number.isFinite(sp.tokenX.decimals) ? sp.tokenX.decimals : 18;
  const decimalsB = Number.isFinite(sp.tokenY.decimals) ? sp.tokenY.decimals : 18;
  const activeBin = sp.activeId ?? null;
  const currentPrice = activeBin == null
    ? null
    : priceFromBinId(activeBin, sp.binStep, decimalsA, decimalsB) || null;

  const subgraphTvl = parsePositiveNumber(sp.totalValueLockedUSD);
  const volume24h = parsePositiveNumber(sp.volumeUSD);
  const hasUSDG = isUSDGToken(sp.tokenX.id) || isUSDGToken(sp.tokenY.id);

  const initialTvl = hasUSDG
    ? (subgraphTvl ?? null)
    : subgraphTvl;

  const pool: IndexedPool = {
    address: sp.id,
    protocol: 'Ramses DLMM',
    pid: 0,
    tokenA: sp.tokenX.id,
    tokenB: sp.tokenY.id,
    symbolA: sp.tokenX.symbol || '???',
    symbolB: sp.tokenY.symbol || '???',
    decimalsA,
    decimalsB,
    pair: `${sp.tokenX.symbol || '???'}/${sp.tokenY.symbol || '???'}`,
    binStep: sp.binStep,
    activeBin,
    currentPrice,
    fee: sp.binStep * 0.01,
    reserveX: sp.reserveX || '0',
    reserveY: sp.reserveY || '0',
    tvl: initialTvl,
    volume1m: existing?.volume1m ?? 0,
    volume5m: existing?.volume5m ?? 0,
    volume15m: existing?.volume15m ?? 0,
    volume1h: existing?.volume1h ?? 0,
    volume6h: existing?.volume6h ?? 0,
    volume24h: existing?.volume24h ?? 0,
    volumeUSD1h: existing?.volumeUSD1h ?? null,
    volumeUSD6h: existing?.volumeUSD6h ?? null,
    volumeUSD24h: volume24h ?? existing?.volumeUSD24h ?? null,
    volumeToTVL: 0,
    volatility: sp.binStep * 0.5,
    analyticsScore: 50,
    riskLevel: 'LOW',
    estimatedAPR: null,
    priceChange24h: existing?.priceChange24h ?? null,
    timeInRange: existing?.timeInRange ?? null,
    swapCount24h: sp.txCount || existing?.swapCount24h || 0,
    swapCount1h: existing?.swapCount1h ?? 0,
    status: sp.isAlive ? 'active' : 'inactive',
    createdBlock: sp.createdAtBlockNumber || existing?.createdBlock || 0,
    createdTimestamp: sp.createdAtTimestamp || existing?.createdTimestamp || 0,
    updatedAt: Date.now(),
  };

  if (existing?.currentPrice && currentPrice) {
    pool.priceChange24h = ((currentPrice - existing.currentPrice) / existing.currentPrice) * 100;
  }

  Object.assign(pool, computeAnalytics(pool));
  return pool;
}

async function processPools(subgraphPools: SubgraphPool[]): Promise<void> {
  for (const sp of subgraphPools) {
    try {
      indexerStore.upsertPool(buildPoolFromSubgraph(sp));
    } catch {
      // Ignore one malformed pool.
    }
  }

  indexerStore.setState({
    poolsDiscovered: indexerStore.getAllPools().length,
    error: null,
  });
}

// ─── RPC enrichment ───────────────────────────────────────────────────────────

interface RpcPoolData {
  activeBin: number;
  currentPrice: number;
  reserveX: string;
  reserveY: string;
}

async function enrichPoolFromRPC(pool: IndexedPool): Promise<RpcPoolData | null> {
  try {
    // These two calls are independent and can be done in parallel.
    const [activeIdHex, reservesHex] = await Promise.all([
      ethCall(pool.address, LBPAIR_GET_ACTIVE_ID),
      ethCall(pool.address, LBPAIR_GET_RESERVES),
    ]);

    const activeBin = decodeUint24(activeIdHex);
    const { reserveX, reserveY } = decodeReserves(reservesHex);
    const currentPrice = priceFromBinId(
      activeBin,
      pool.binStep,
      pool.decimalsA,
      pool.decimalsB,
    );

    return {
      activeBin,
      currentPrice,
      reserveX,
      reserveY,
    };
  } catch {
    return null;
  }
}

async function enrichUSDGPools(): Promise<void> {
  const candidates = indexerStore
    .getAllPools()
    .filter((pool) =>
      pool.status === 'active' &&
      (isUSDGToken(pool.tokenA) || isUSDGToken(pool.tokenB))
    )
    .slice(0, MAX_USDG_RPC_POOLS);

  await mapWithConcurrency(candidates, RPC_CONCURRENCY, async (pool) => {
    const rpcData = await enrichPoolFromRPC(pool);
    if (!rpcData) return;

    const updated: IndexedPool = {
      ...pool,
      activeBin: rpcData.activeBin,
      currentPrice: rpcData.currentPrice || pool.currentPrice,
      reserveX: rpcData.reserveX,
      reserveY: rpcData.reserveY,
      updatedAt: Date.now(),
    };

    // IMPORTANT: zero live reserves do NOT erase a valid subgraph TVL.
    // This protects pools where the contract call is valid but the pair has
    // no current liquidity, and it also avoids turning a good TVL into N/A.
    const hasLiveReserves = rpcData.reserveX !== '0' || rpcData.reserveY !== '0';
    if (hasLiveReserves) {
      const estimate = estimateTvlFromUSDG(
        updated.tokenA,
        updated.tokenB,
        updated.decimalsA,
        updated.decimalsB,
        updated.reserveX,
        updated.reserveY,
        updated.currentPrice ?? 0,
      );

      if (estimate.tvl != null) {
        updated.tvl = estimate.tvl;
      }

      if ((!updated.currentPrice || !Number.isFinite(updated.currentPrice)) && estimate.priceXInY > 0) {
        updated.currentPrice = estimate.priceXInY;
      }
    }

    Object.assign(updated, computeAnalytics(updated));
    indexerStore.upsertPool(updated);
  });
}

// ─── Volume enrichment ─────────────────────────────────────────────────────────

async function enrichVolumeFromSubgraph(): Promise<void> {
  const pools = indexerStore.getAllPools();

  await mapWithConcurrency(pools, SUBGRAPH_CONCURRENCY, async (pool) => {
    const volData = await fetchPoolVolumeFromSubgraph(pool.address);
    if (!volData) return;

    const vol1h = parsePositiveNumber(volData.vol1h?.aggregate?.sum?.amountUSD ?? null) ?? 0;
    const vol6h = parsePositiveNumber(volData.vol6h?.aggregate?.sum?.amountUSD ?? null) ?? 0;
    const vol24h = parsePositiveNumber(volData.vol24h?.aggregate?.sum?.amountUSD ?? null) ?? 0;

    const updated: IndexedPool = {
      ...pool,
      volumeUSD1h: vol1h > 0 ? vol1h : null,
      volumeUSD6h: vol6h > 0 ? vol6h : null,
      volumeUSD24h: vol24h > 0 ? vol24h : null,
      swapCount1h: volData.vol1h?.aggregate?.count ?? 0,
      swapCount24h: volData.vol24h?.aggregate?.count ?? pool.swapCount24h,
      updatedAt: Date.now(),
    };

    Object.assign(updated, computeAnalytics(updated));
    indexerStore.upsertPool(updated);
  });
}

// ─── Optional swap history ─────────────────────────────────────────────────────

async function syncRecentSwaps(): Promise<void> {
  if (MAX_SWAPS_POOLS <= 0) return;

  const pools = indexerStore
    .getAllPools()
    .filter((p) => p.status === 'active')
    .sort((a, b) => (b.volumeUSD24h ?? 0) - (a.volumeUSD24h ?? 0))
    .slice(0, MAX_SWAPS_POOLS);

  await mapWithConcurrency(pools, SUBGRAPH_CONCURRENCY, async (pool) => {
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
        price: s.activeBinId
          ? priceFromBinId(s.activeBinId, pool.binStep, pool.decimalsA, pool.decimalsB) || null
          : null,
        volumeUSD: s.amountUSD ? Number(s.amountUSD) : null,
      };
      indexerStore.addSwap(swap);
    }
  });
}

// ─── Factory fallback ──────────────────────────────────────────────────────────

async function scanFactoryViaRPC(): Promise<void> {
  const countHex = await ethCall(FACTORY_ADDRESS, FACTORY_GET_NUMBER_OF_LB_PAIRS);
  const count = Number(decodeUint256(countHex));

  if (!Number.isFinite(count) || count <= 0) {
    indexerStore.setState({
      poolsDiscovered: 0,
      error: 'Ramses DLMM factory returned zero LB pairs.',
    });
    return;
  }

  const maxPairs = Math.min(count, MAX_FACTORY_POOLS);

  await mapWithConcurrency(
    Array.from({ length: maxPairs }, (_, index) => index),
    FACTORY_CONCURRENCY,
    async (index) => {
      try {
        const pairHex = await ethCall(
          FACTORY_ADDRESS,
          `${FACTORY_GET_LB_PAIR_AT_INDEX}${BigInt(index).toString(16).padStart(64, '0')}`,
        );
        const pairAddress = decodeAddress(pairHex);
        if (/^0x0+$/.test(pairAddress)) return;

        // Discovery fallback is intentionally limited to metadata + active bin + reserves.
        const [tokenXHex, tokenYHex, binStepHex, activeIdHex, reservesHex] = await Promise.all([
          ethCall(pairAddress, LBPAIR_TOKEN_X),
          ethCall(pairAddress, LBPAIR_TOKEN_Y),
          ethCall(pairAddress, LBPAIR_BIN_STEP),
          ethCall(pairAddress, LBPAIR_GET_ACTIVE_ID),
          ethCall(pairAddress, LBPAIR_GET_RESERVES),
        ]);

        const tokenX = decodeAddress(tokenXHex);
        const tokenY = decodeAddress(tokenYHex);
        const binStep = decodeUint16(binStepHex);
        const activeBin = decodeUint24(activeIdHex);
        const { reserveX, reserveY } = decodeReserves(reservesHex);
        const [metaX, metaY] = await Promise.all([
          getTokenMetadata(tokenX),
          getTokenMetadata(tokenY),
        ]);

        const currentPrice = priceFromBinId(activeBin, binStep, metaX.decimals, metaY.decimals);
        const estimate = estimateTvlFromUSDG(
          tokenX,
          tokenY,
          metaX.decimals,
          metaY.decimals,
          reserveX,
          reserveY,
          currentPrice,
        );
        const existing = indexerStore.getPool(pairAddress);

        const pool: IndexedPool = {
          address: pairAddress,
          protocol: 'Ramses DLMM',
          pid: index,
          tokenA: tokenX,
          tokenB: tokenY,
          symbolA: metaX.symbol,
          symbolB: metaY.symbol,
          decimalsA: metaX.decimals,
          decimalsB: metaY.decimals,
          pair: `${metaX.symbol}/${metaY.symbol}`,
          binStep,
          activeBin,
          currentPrice: currentPrice || existing?.currentPrice || null,
          fee: binStep * 0.01,
          reserveX,
          reserveY,
          tvl: estimate.tvl ?? existing?.tvl ?? null,
          volume1m: existing?.volume1m ?? 0,
          volume5m: existing?.volume5m ?? 0,
          volume15m: existing?.volume15m ?? 0,
          volume1h: existing?.volume1h ?? 0,
          volume6h: existing?.volume6h ?? 0,
          volume24h: existing?.volume24h ?? 0,
          volumeUSD1h: existing?.volumeUSD1h ?? null,
          volumeUSD6h: existing?.volumeUSD6h ?? null,
          volumeUSD24h: existing?.volumeUSD24h ?? null,
          volumeToTVL: 0,
          volatility: binStep * 0.5,
          analyticsScore: 50,
          riskLevel: binStep >= 20 ? 'HIGH' : binStep >= 10 ? 'MEDIUM' : 'LOW',
          estimatedAPR: existing?.estimatedAPR ?? null,
          priceChange24h: existing?.currentPrice && currentPrice
            ? ((currentPrice - existing.currentPrice) / existing.currentPrice) * 100
            : null,
          timeInRange: existing?.timeInRange ?? null,
          swapCount24h: existing?.swapCount24h ?? 0,
          swapCount1h: existing?.swapCount1h ?? 0,
          status: 'active',
          createdBlock: existing?.createdBlock ?? 0,
          createdTimestamp: existing?.createdTimestamp ?? 0,
          updatedAt: Date.now(),
        };

        Object.assign(pool, computeAnalytics(pool));
        indexerStore.upsertPool(pool);
      } catch {
        // Skip malformed/stale factory entry.
      }
    },
  );

  indexerStore.setState({
    poolsDiscovered: indexerStore.getAllPools().length,
    error: null,
  });
}

// ─── Main indexer ──────────────────────────────────────────────────────────────

export async function runIndexer(): Promise<void> {
  if (indexerRunning) return;
  indexerRunning = true;

  indexerStore.setState({
    status: 'indexing',
    startedAt: Date.now(),
    error: null,
  });

  try {
    const now = Date.now();
    const hasPools = indexerStore.getAllPools().length > 0;

    // 1) Discovery is relatively expensive, so do it only periodically in a warm process.
    // A fresh Vercel instance will still discover immediately because hasPools is false.
    if (!hasPools || now - lastDiscoveryAt >= DISCOVERY_INTERVAL_MS) {
      try {
        const pools = await fetchPoolsFromSubgraph();
        if (pools.length > 0) {
          await processPools(pools);
          lastDiscoveryAt = now;
        } else if (!hasPools) {
          await scanFactoryViaRPC();
          lastDiscoveryAt = now;
        }
      } catch {
        if (!hasPools) {
          await scanFactoryViaRPC();
          lastDiscoveryAt = now;
        }
      }
    }

    // 2) Live TVL/price refresh only touches USDG pools.
    if (now - lastRpcRefreshAt >= RPC_REFRESH_INTERVAL_MS) {
      await enrichUSDGPools();
      lastRpcRefreshAt = Date.now();
    }

    // 3) Volume is slower and does not need to run on every request.
    if (now - lastVolumeRefreshAt >= VOLUME_REFRESH_INTERVAL_MS) {
      await enrichVolumeFromSubgraph();
      lastVolumeRefreshAt = Date.now();
    }

    // 4) Swap history is optional and deliberately sampled, not fetched for every pool.
    if (now - lastSwapRefreshAt >= SWAP_REFRESH_INTERVAL_MS) {
      await syncRecentSwaps();
      lastSwapRefreshAt = Date.now();
    }

    const blockNumber = await getBlockNumber();
    indexerStore.setState({
      status: 'live',
      lastIndexedBlock: blockNumber,
      lastIndexedTimestamp: Date.now(),
      poolsDiscovered: indexerStore.getAllPools().length,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Indexer error';
    indexerStore.setState({
      status: indexerStore.getAllPools().length > 0 ? 'live' : 'error',
      error: message,
    });
  } finally {
    indexerRunning = false;
  }
}

export async function syncPools(): Promise<void> {
  const pools = await fetchPoolsFromSubgraph();
  if (pools.length > 0) {
    await processPools(pools);
    await enrichUSDGPools();
  } else {
    await scanFactoryViaRPC();
  }
}

export async function onNewBlock(blockNumber: number): Promise<{
  updatedPools: string[];
  newSwaps: IndexedSwap[];
}> {
  const before = new Set(indexerStore.getAllPools().map((p) => p.address.toLowerCase()));
  await enrichUSDGPools();

  const updatedPools = indexerStore
    .getAllPools()
    .filter((p) => before.has(p.address.toLowerCase()))
    .map((p) => p.address);

  indexerStore.setState({
    lastIndexedBlock: blockNumber,
    lastIndexedTimestamp: Date.now(),
    status: 'live',
  });

  return { updatedPools, newSwaps: [] };
}

export { FACTORY_ADDRESS, SUBGRAPH_URL, CHAIN_ID, priceFromBinId, estimateTvlFromUSDG };
