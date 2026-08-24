/**
 * Ramses DLMM Indexer V10 — Robinhood Chain (4663)
 *
 * Design goals:
 *  - Fast warm requests: discovery, RPC enrichment and volume refresh are cached.
 *  - Never make one RPC/subgraph request per pool for 1h/6h/24h volume.
 *  - Read recent swaps globally, then aggregate them locally by pool/window.
 *  - Prefer on-chain USDG valuation for live TVL; never erase good TVL with 0/0 RPC.
 *  - Keep compatibility with the existing in-memory store.ts interface.
 *  - Fail soft: one bad pool/query never takes the whole indexer down.
 *
 * This file is read-only. It never submits transactions.
 */

import { indexerStore, IndexedPool, IndexedSwap } from './store';

declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(input: string, encoding: string): { toString(encoding: string): string } };

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

// Cache/refresh policy.
const DISCOVERY_INTERVAL_MS = 5 * 60_000;
const RPC_REFRESH_INTERVAL_MS = 20_000;
const VOLUME_REFRESH_INTERVAL_MS = 60_000;
const SWAP_REFRESH_INTERVAL_MS = 60_000;

const RPC_CONCURRENCY = Math.max(1, Number(process.env.DLMM_RPC_CONCURRENCY || 8));
const MAX_USDG_RPC_POOLS = Math.max(1, Number(process.env.DLMM_MAX_USDG_RPC_POOLS || 100));
const MAX_FACTORY_POOLS = Math.max(1, Number(process.env.DLMM_MAX_POOLS || 200));
const FACTORY_CONCURRENCY = Math.max(1, Number(process.env.DLMM_FACTORY_CONCURRENCY || 6));
const SWAP_PAGE_SIZE = Math.min(1000, Math.max(100, Number(process.env.DLMM_SWAP_PAGE_SIZE || 1000)));
const SWAP_MAX_PAGES = Math.min(30, Math.max(1, Number(process.env.DLMM_SWAP_MAX_PAGES || 15)));
const SWAP_REFRESH_POOLS = Math.max(1, Number(process.env.DLMM_SWAP_REFRESH_POOLS || 250));

let indexerRunning = false;
let lastDiscoveryAt = 0;
let lastRpcRefreshAt = 0;
let lastVolumeRefreshAt = 0;
let lastSwapRefreshAt = 0;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); } catch { /* fail soft */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: unknown; error?: { message?: string } };
  if (data.error) throw new Error(`RPC: ${data.error.message || 'Unknown error'}`);
  if (data.result === undefined) throw new Error('RPC response missing result');
  return data.result;
}

async function ethCall(to: string, data: string): Promise<string> {
  return String(await rpcCall('eth_call', [{ to, data }, 'latest']));
}

async function getBlockNumber(): Promise<number> {
  return parseInt(String(await rpcCall('eth_blockNumber')), 16);
}

function cleanHex(hex: string): string { return hex.startsWith('0x') ? hex.slice(2) : hex; }

function decodeUint256(hex: string): bigint {
  const c = cleanHex(hex);
  if (!c) return 0n;
  return BigInt(`0x${c.slice(0, 64).padStart(64, '0')}`);
}

function decodeUint24(hex: string): number { return Number(decodeUint256(hex)); }
function decodeUint16(hex: string): number { return Number(decodeUint256(hex)); }

function decodeAddress(hex: string): string {
  const c = cleanHex(hex);
  if (c.length < 64) throw new Error('Invalid address ABI result');
  return `0x${c.slice(24, 64)}`;
}

function decodeString(hex: string): string {
  try {
    const c = cleanHex(hex);
    if (c.length < 128) return Buffer.from(c.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim() || '???';
    const len = parseInt(c.slice(64, 128), 16);
    if (!Number.isFinite(len) || len <= 0 || len > 100) return Buffer.from(c.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim() || '???';
    return Buffer.from(c.slice(128, 128 + len * 2), 'hex').toString('utf8').replace(/\0/g, '').trim() || '???';
  } catch { return '???'; }
}

function decodeReserves(hex: string): { reserveX: string; reserveY: string } {
  const c = cleanHex(hex);
  if (c.length < 128) throw new Error(`Invalid getReserves response length: ${c.length}`);
  return {
    reserveX: BigInt(`0x${c.slice(0, 64)}`).toString(),
    reserveY: BigInt(`0x${c.slice(64, 128)}`).toString(),
  };
}

function rawPriceFromBinId(binId: number, binStep: number): number {
  if (!Number.isFinite(binId) || !Number.isFinite(binStep) || binStep < 0) return 0;
  const base = 1 + binStep / 10_000;
  const exponent = binId - 8_388_608;
  const raw = Math.pow(base, exponent);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function priceFromBinId(binId: number, binStep: number, decimalsX = 18, decimalsY = 18): number {
  const raw = rawPriceFromBinId(binId, binStep);
  if (!raw) return 0;
  const human = raw * 10 ** (decimalsX - decimalsY);
  return Number.isFinite(human) && human > 0 ? human : 0;
}

const tokenCache = new Map<string, { symbol: string; decimals: number }>();
async function getTokenMetadata(address: string): Promise<{ symbol: string; decimals: number }> {
  const key = address.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached) return cached;
  if (key === WETH_ADDRESS.toLowerCase()) return cacheToken(key, { symbol: 'WETH', decimals: 18 });
  if (key === USDG_ADDRESS.toLowerCase()) return cacheToken(key, { symbol: 'USDG', decimals: 6 });
  try {
    const [s, d] = await Promise.all([ethCall(address, ERC20_SYMBOL), ethCall(address, ERC20_DECIMALS)]);
    const meta = { symbol: decodeString(s), decimals: Math.min(36, Math.max(0, Number(decodeUint256(d)))) };
    return cacheToken(key, meta);
  } catch {
    return cacheToken(key, { symbol: key.slice(2, 8).toUpperCase(), decimals: 18 });
  }
}
function cacheToken(key: string, meta: { symbol: string; decimals: number }) { tokenCache.set(key, meta); return meta; }

interface SubgraphToken { id: string; symbol: string; decimals: number; }
interface SubgraphPool {
  id: string; tokenX: SubgraphToken; tokenY: SubgraphToken; binStep: number; activeId: number | null;
  reserveX: string; reserveY: string; totalValueLockedUSD: string | null; volumeUSD: string | null;
  feesUSD: string | null; txCount: number; createdAtBlockNumber: number; createdAtTimestamp: number; isAlive: boolean;
}
interface SubgraphSwap {
  id: string; pool: string; transaction: string; timestamp: number; blockNumber: number;
  tokenIn: string; tokenOut: string; amountIn: string; amountOut: string; amountUSD: string | null; activeBinId: number;
}

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }), cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const data = await res.json() as { data?: any; errors?: Array<{ message?: string }> };
  if (data.errors?.length) throw new Error(`Subgraph: ${data.errors[0]?.message || 'Unknown error'}`);
  return data.data;
}

async function fetchPoolsFromSubgraph(): Promise<SubgraphPool[]> {
  const query = `
    query GetPools($chainId: Int!, $limit: Int!, $offset: Int!) {
      DLMMPool(
        where: { chainId: { _eq: $chainId } }
        limit: $limit offset: $offset order_by: { createdAtTimestamp: asc }
      ) {
        id tokenX { id symbol decimals } tokenY { id symbol decimals }
        binStep activeId reserveX reserveY totalValueLockedUSD volumeUSD feesUSD txCount
        createdAtBlockNumber createdAtTimestamp isAlive
      }
    }
  `;
  const all: SubgraphPool[] = [];
  for (let offset = 0; offset < MAX_FACTORY_POOLS + 100; offset += 100) {
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, limit: 100, offset });
    const page = (data.DLMMPool ?? []) as SubgraphPool[];
    all.push(...page);
    if (page.length < 100 || all.length >= MAX_FACTORY_POOLS) break;
  }
  return all.slice(0, MAX_FACTORY_POOLS);
}

function isUSDGToken(address: string): boolean { return address.toLowerCase() === USDG_ADDRESS.toLowerCase(); }
function humanReserve(raw: string, decimals: number): number {
  try { const n = Number(BigInt(raw || '0')); const v = n / 10 ** decimals; return Number.isFinite(v) && v >= 0 ? v : 0; }
  catch { return 0; }
}

function reserveRatioPrice(tokenX: string, tokenY: string, dx: number, dy: number, rx: string, ry: string): number {
  const x = humanReserve(rx, dx), y = humanReserve(ry, dy);
  if (x <= 0 || y <= 0) return 0;
  if (isUSDGToken(tokenY) && !isUSDGToken(tokenX)) return y / x;
  if (isUSDGToken(tokenX) && !isUSDGToken(tokenY)) return x / y;
  return 0;
}

interface TvlEstimate { tvl: number | null; priceXInY: number; source: 'bin' | 'reserve-ratio' | 'stable-side-only' | 'none'; }
function estimateTvlFromUSDG(tokenX: string, tokenY: string, dx: number, dy: number, rx: string, ry: string, binPrice: number): TvlEstimate {
  const x = humanReserve(rx, dx), y = humanReserve(ry, dy);
  const xStable = isUSDGToken(tokenX), yStable = isUSDGToken(tokenY);
  if (!xStable && !yStable) return { tvl: null, priceXInY: 0, source: 'none' };
  if (x <= 0 && y <= 0) return { tvl: null, priceXInY: 0, source: 'none' };
  let p = Number.isFinite(binPrice) && binPrice > 0 ? binPrice : 0;
  let source: TvlEstimate['source'] = p > 0 ? 'bin' : 'none';
  if (!p) { p = reserveRatioPrice(tokenX, tokenY, dx, dy, rx, ry); if (p > 0) source = 'reserve-ratio'; }
  if (yStable && !xStable) {
    if (p > 0) return { tvl: x * p + y, priceXInY: p, source };
    return y > 0 ? { tvl: y, priceXInY: 0, source: 'stable-side-only' } : { tvl: null, priceXInY: 0, source: 'none' };
  }
  if (xStable && !yStable) {
    if (p > 0) return { tvl: x + y / p, priceXInY: p, source };
    return x > 0 ? { tvl: x, priceXInY: 0, source: 'stable-side-only' } : { tvl: null, priceXInY: 0, source: 'none' };
  }
  return { tvl: null, priceXInY: 0, source: 'none' };
}

function numOrNull(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null;
}

function computeAnalytics(pool: IndexedPool): Partial<IndexedPool> {
  const vol24 = pool.volumeUSD24h ?? pool.volume24h ?? 0;
  const tvl = pool.tvl ?? 0;
  const vtl = tvl > 0 ? vol24 / tvl : 0;
  const apr = tvl > 0 && vol24 > 0 ? (pool.fee / 100) * vol24 * 365 / tvl * 100 : null;
  let score = 35;
  if (tvl > 0) score += 10;
  if (tvl >= 1_000) score += 10;
  if (tvl >= 10_000) score += 10;
  if (vtl >= 0.1) score += 10;
  if (vtl >= 1) score += 10;
  if (pool.swapCount1h >= 5) score += 5;
  if (pool.swapCount1h >= 25) score += 5;
  if (pool.status === 'active') score += 5;
  const riskLevel: IndexedPool['riskLevel'] = pool.binStep >= 50 ? 'EXTREME' : pool.binStep >= 20 ? 'HIGH' : pool.binStep >= 10 ? 'MEDIUM' : 'LOW';
  return { volumeToTVL: vtl, estimatedAPR: apr, analyticsScore: Math.max(0, Math.min(100, score)), riskLevel };
}

function buildPoolFromSubgraph(sp: SubgraphPool): IndexedPool {
  const existing = indexerStore.getPool(sp.id);
  const dx = Number.isFinite(sp.tokenX.decimals) ? sp.tokenX.decimals : 18;
  const dy = Number.isFinite(sp.tokenY.decimals) ? sp.tokenY.decimals : 18;
  const activeBin = sp.activeId ?? null;
  const price = activeBin == null ? null : priceFromBinId(activeBin, sp.binStep, dx, dy) || null;
  const subTvl = numOrNull(sp.totalValueLockedUSD);
  const cumulativeVol = numOrNull(sp.volumeUSD);
  const pool: IndexedPool = {
    address: sp.id, protocol: 'Ramses DLMM', pid: existing?.pid ?? 0,
    tokenA: sp.tokenX.id, tokenB: sp.tokenY.id, symbolA: sp.tokenX.symbol || '???', symbolB: sp.tokenY.symbol || '???',
    decimalsA: dx, decimalsB: dy, pair: `${sp.tokenX.symbol || '???'}/${sp.tokenY.symbol || '???'}`,
    binStep: sp.binStep, activeBin, currentPrice: price, fee: sp.binStep * 0.01,
    reserveX: sp.reserveX || '0', reserveY: sp.reserveY || '0', tvl: subTvl ?? existing?.tvl ?? null,
    volume1m: existing?.volume1m ?? 0, volume5m: existing?.volume5m ?? 0, volume15m: existing?.volume15m ?? 0,
    volume1h: existing?.volume1h ?? 0, volume6h: existing?.volume6h ?? 0, volume24h: existing?.volume24h ?? 0,
    volumeUSD1h: existing?.volumeUSD1h ?? null, volumeUSD6h: existing?.volumeUSD6h ?? null,
    volumeUSD24h: existing?.volumeUSD24h ?? null,
    volumeToTVL: existing?.volumeToTVL ?? 0, volatility: existing?.volatility ?? sp.binStep * 0.5,
    analyticsScore: existing?.analyticsScore ?? 35, riskLevel: existing?.riskLevel ?? 'LOW', estimatedAPR: existing?.estimatedAPR ?? null,
    priceChange24h: existing?.priceChange24h ?? null, timeInRange: existing?.timeInRange ?? null,
    swapCount24h: existing?.swapCount24h ?? sp.txCount ?? 0, swapCount1h: existing?.swapCount1h ?? 0,
    status: sp.isAlive ? 'active' : 'inactive', createdBlock: sp.createdAtBlockNumber || existing?.createdBlock || 0,
    createdTimestamp: sp.createdAtTimestamp || existing?.createdTimestamp || 0, updatedAt: Date.now(),
  };
  // Keep cumulative volume only as a fallback signal; do not label it 24h.
  void cumulativeVol;
  Object.assign(pool, computeAnalytics(pool));
  return pool;
}

async function processPools(pools: SubgraphPool[]): Promise<void> {
  for (const sp of pools) {
    try { indexerStore.upsertPool(buildPoolFromSubgraph(sp)); } catch { /* ignore */ }
  }
  indexerStore.setState({ poolsDiscovered: indexerStore.getAllPools().length, error: null });
}

async function enrichPoolFromRPC(pool: IndexedPool): Promise<{ activeBin: number; currentPrice: number; reserveX: string; reserveY: string } | null> {
  try {
    const [activeHex, reservesHex] = await Promise.all([ethCall(pool.address, LBPAIR_GET_ACTIVE_ID), ethCall(pool.address, LBPAIR_GET_RESERVES)]);
    const activeBin = decodeUint24(activeHex);
    const { reserveX, reserveY } = decodeReserves(reservesHex);
    return { activeBin, currentPrice: priceFromBinId(activeBin, pool.binStep, pool.decimalsA, pool.decimalsB), reserveX, reserveY };
  } catch { return null; }
}

async function enrichUSDGPools(): Promise<void> {
  const pools = indexerStore.getAllPools()
    .filter(p => p.status === 'active' && (isUSDGToken(p.tokenA) || isUSDGToken(p.tokenB)))
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, MAX_USDG_RPC_POOLS);

  await mapWithConcurrency(pools, RPC_CONCURRENCY, async pool => {
    const rpc = await enrichPoolFromRPC(pool);
    if (!rpc) return;
    const updated: IndexedPool = { ...pool, activeBin: rpc.activeBin, currentPrice: rpc.currentPrice || pool.currentPrice, reserveX: rpc.reserveX, reserveY: rpc.reserveY, updatedAt: Date.now() };
    if (rpc.reserveX !== '0' || rpc.reserveY !== '0') {
      const est = estimateTvlFromUSDG(updated.tokenA, updated.tokenB, updated.decimalsA, updated.decimalsB, rpc.reserveX, rpc.reserveY, updated.currentPrice ?? 0);
      if (est.tvl != null) updated.tvl = est.tvl;
    }
    Object.assign(updated, computeAnalytics(updated));
    indexerStore.upsertPool(updated);
  });
}

// One global swap feed replaces N pools × 3 aggregate queries.
// We page backwards through the newest swaps until we have crossed 24h or hit the safety cap.
async function fetchRecentSwapsGlobal(sinceSeconds: number): Promise<SubgraphSwap[]> {
  const query = `
    query GetRecentSwaps($chainId: Int!, $limit: Int!, $offset: Int!) {
      DLMMSwap(
        where: { chainId: { _eq: $chainId } }
        limit: $limit offset: $offset order_by: { timestamp: desc }
      ) {
        id pool transaction timestamp blockNumber tokenIn tokenOut amountIn amountOut amountUSD activeBinId
      }
    }
  `;
  const all: SubgraphSwap[] = [];
  for (let page = 0; page < SWAP_MAX_PAGES; page++) {
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, limit: SWAP_PAGE_SIZE, offset: page * SWAP_PAGE_SIZE });
    const rows = (data.DLMMSwap ?? []) as SubgraphSwap[];
    if (!rows.length) break;
    all.push(...rows);
    const oldest = Number(rows[rows.length - 1]?.timestamp ?? 0);
    if (oldest > 0 && oldest < sinceSeconds) break;
    if (rows.length < SWAP_PAGE_SIZE) break;
  }
  return all.filter(s => Number(s.timestamp) * 1000 >= Date.now() - 86_400_000);
}

function calculateSwapUSD(s: SubgraphSwap, pool: IndexedPool): number | null {
  const direct = numOrNull(s.amountUSD);
  if (direct != null && direct > 0) return direct;
  // Only infer USD when one side is USDG. This avoids inventing prices for arbitrary pairs.
  const amountIn = Number(s.amountIn);
  if (!Number.isFinite(amountIn) || amountIn <= 0) return null;
  const tokenIn = s.tokenIn.toLowerCase();
  const tokenADecimals = pool.decimalsA;
  const tokenBDecimals = pool.decimalsB;
  if (tokenIn === pool.tokenA.toLowerCase() && isUSDGToken(pool.tokenA)) return amountIn / 10 ** tokenADecimals;
  if (tokenIn === pool.tokenB.toLowerCase() && isUSDGToken(pool.tokenB)) return amountIn / 10 ** tokenBDecimals;
  if (tokenIn === pool.tokenA.toLowerCase() && isUSDGToken(pool.tokenB) && pool.currentPrice && pool.currentPrice > 0) {
    return (amountIn / 10 ** tokenADecimals) * pool.currentPrice;
  }
  if (tokenIn === pool.tokenB.toLowerCase() && isUSDGToken(pool.tokenA) && pool.currentPrice && pool.currentPrice > 0) {
    return (amountIn / 10 ** tokenBDecimals) / pool.currentPrice;
  }
  return null;
}

function applySwapMetrics(swaps: SubgraphSwap[]): void {
  const pools = new Map(indexerStore.getAllPools().map(p => [p.address.toLowerCase(), p]));
  const selected = new Set(indexerStore.getAllPools().filter(p => p.status === 'active').sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, SWAP_REFRESH_POOLS).map(p => p.address.toLowerCase()));
  const now = Date.now();
  const windows = { m5: now - 5 * 60_000, m15: now - 15 * 60_000, h1: now - 60 * 60_000, h6: now - 6 * 60 * 60_000, h24: now - 24 * 60 * 60_000 };
  const agg = new Map<string, { m5: number; m15: number; h1: number; h6: number; h24: number; c1: number; c24: number }>();

  for (const s of swaps) {
    const addr = s.pool.toLowerCase();
    if (!selected.has(addr)) continue;
    const pool = pools.get(addr); if (!pool) continue;
    const t = Number(s.timestamp) * 1000;
    if (!Number.isFinite(t) || t < windows.h24) continue;
    const usd = calculateSwapUSD(s, pool);
    if (usd == null) continue;
    let a = agg.get(addr); if (!a) { a = { m5: 0, m15: 0, h1: 0, h6: 0, h24: 0, c1: 0, c24: 0 }; agg.set(addr, a); }
    a.h24 += usd;
    if (t >= windows.h6) a.h6 += usd;
    if (t >= windows.h1) { a.h1 += usd; a.c1++; }
    if (t >= windows.m15) a.m15 += usd;
    if (t >= windows.m5) a.m5 += usd;
    a.c24++;
  }

  for (const [addr, a] of agg) {
    const pool = pools.get(addr); if (!pool) continue;
    const updated: IndexedPool = {
      ...pool,
      volume1m: a.m5 / 5,
      volume5m: a.m5,
      volume15m: a.m15,
      volume1h: a.h1,
      volume6h: a.h6,
      volume24h: a.h24,
      volumeUSD1h: a.h1,
      volumeUSD6h: a.h6,
      volumeUSD24h: a.h24,
      swapCount1h: a.c1,
      swapCount24h: a.c24,
      updatedAt: Date.now(),
    };
    Object.assign(updated, computeAnalytics(updated));
    indexerStore.upsertPool(updated);
  }

  // Pools with no observed swaps in the window must explicitly become zero,
  // otherwise an old non-zero volume would remain forever in a warm instance.
  for (const pool of indexerStore.getAllPools()) {
    if (!selected.has(pool.address.toLowerCase())) continue;
    if (agg.has(pool.address.toLowerCase())) continue;
    const updated: IndexedPool = { ...pool, volume1m: 0, volume5m: 0, volume15m: 0, volume1h: 0, volume6h: 0, volume24h: 0, volumeUSD1h: 0, volumeUSD6h: 0, volumeUSD24h: 0, swapCount1h: 0, swapCount24h: 0, updatedAt: Date.now() };
    Object.assign(updated, computeAnalytics(updated));
    indexerStore.upsertPool(updated);
  }
}

async function refreshGlobalVolume(): Promise<void> {
  const since = Math.floor((Date.now() - 86_400_000) / 1000);
  const swaps = await fetchRecentSwapsGlobal(since);
  // Store only a bounded recent subset; analytics is computed from the fetched page set.
  for (const s of swaps.slice(0, 10_000)) {
    const pool = indexerStore.getPool(s.pool);
    if (!pool) continue;
    indexerStore.addSwap({
      poolAddress: pool.address, txHash: s.transaction, blockNumber: Number(s.blockNumber), timestamp: Number(s.timestamp),
      tokenIn: s.tokenIn, tokenOut: s.tokenOut, amountIn: s.amountIn, amountOut: s.amountOut, activeBinAfter: Number(s.activeBinId),
      price: Number(s.activeBinId) > 0 ? priceFromBinId(Number(s.activeBinId), pool.binStep, pool.decimalsA, pool.decimalsB) || null : null,
      volumeUSD: calculateSwapUSD(s, pool),
    });
  }
  applySwapMetrics(swaps);
}

async function scanFactoryViaRPC(): Promise<void> {
  const count = Number(decodeUint256(await ethCall(FACTORY_ADDRESS, FACTORY_GET_NUMBER_OF_LB_PAIRS)));
  if (!Number.isFinite(count) || count <= 0) throw new Error('Ramses DLMM factory returned zero LB pairs');
  const max = Math.min(count, MAX_FACTORY_POOLS);
  await mapWithConcurrency(Array.from({ length: max }, (_, i) => i), FACTORY_CONCURRENCY, async i => {
    try {
      const pair = decodeAddress(await ethCall(FACTORY_ADDRESS, `${FACTORY_GET_LB_PAIR_AT_INDEX}${BigInt(i).toString(16).padStart(64, '0')}`));
      const [xH, yH, stepH, idH, reservesH] = await Promise.all([ethCall(pair, LBPAIR_TOKEN_X), ethCall(pair, LBPAIR_TOKEN_Y), ethCall(pair, LBPAIR_BIN_STEP), ethCall(pair, LBPAIR_GET_ACTIVE_ID), ethCall(pair, LBPAIR_GET_RESERVES)]);
      const x = decodeAddress(xH), y = decodeAddress(yH), step = decodeUint16(stepH), id = decodeUint24(idH), r = decodeReserves(reservesH);
      const [mx, my] = await Promise.all([getTokenMetadata(x), getTokenMetadata(y)]);
      const price = priceFromBinId(id, step, mx.decimals, my.decimals);
      const est = estimateTvlFromUSDG(x, y, mx.decimals, my.decimals, r.reserveX, r.reserveY, price);
      const existing = indexerStore.getPool(pair);
      const pool: IndexedPool = {
        address: pair, protocol: 'Ramses DLMM', pid: i, tokenA: x, tokenB: y, symbolA: mx.symbol, symbolB: my.symbol,
        decimalsA: mx.decimals, decimalsB: my.decimals, pair: `${mx.symbol}/${my.symbol}`, binStep: step, activeBin: id,
        currentPrice: price || existing?.currentPrice || null, fee: step * 0.01, reserveX: r.reserveX, reserveY: r.reserveY,
        tvl: est.tvl ?? existing?.tvl ?? null, volume1m: existing?.volume1m ?? 0, volume5m: existing?.volume5m ?? 0,
        volume15m: existing?.volume15m ?? 0, volume1h: existing?.volume1h ?? 0, volume6h: existing?.volume6h ?? 0,
        volume24h: existing?.volume24h ?? 0, volumeUSD1h: existing?.volumeUSD1h ?? null, volumeUSD6h: existing?.volumeUSD6h ?? null,
        volumeUSD24h: existing?.volumeUSD24h ?? null, volumeToTVL: 0, volatility: step * 0.5, analyticsScore: 35,
        riskLevel: step >= 50 ? 'EXTREME' : step >= 20 ? 'HIGH' : step >= 10 ? 'MEDIUM' : 'LOW', estimatedAPR: existing?.estimatedAPR ?? null,
        priceChange24h: existing?.priceChange24h ?? null, timeInRange: existing?.timeInRange ?? null,
        swapCount24h: existing?.swapCount24h ?? 0, swapCount1h: existing?.swapCount1h ?? 0, status: 'active',
        createdBlock: existing?.createdBlock ?? 0, createdTimestamp: existing?.createdTimestamp ?? 0, updatedAt: Date.now(),
      };
      Object.assign(pool, computeAnalytics(pool));
      indexerStore.upsertPool(pool);
    } catch { /* skip bad pair */ }
  });
  indexerStore.setState({ poolsDiscovered: indexerStore.getAllPools().length, error: null });
}

export async function runIndexer(): Promise<void> {
  if (indexerRunning) return;
  indexerRunning = true;
  indexerStore.setState({ status: 'indexing', startedAt: Date.now(), error: null });
  try {
    const now = Date.now();
    const hasPools = indexerStore.getAllPools().length > 0;

    if (!hasPools || now - lastDiscoveryAt >= DISCOVERY_INTERVAL_MS) {
      try {
        const pools = await fetchPoolsFromSubgraph();
        if (pools.length) { await processPools(pools); lastDiscoveryAt = Date.now(); }
        else if (!hasPools) { await scanFactoryViaRPC(); lastDiscoveryAt = Date.now(); }
      } catch (err) {
        if (!hasPools) { await scanFactoryViaRPC(); lastDiscoveryAt = Date.now(); }
        else indexerStore.setState({ error: err instanceof Error ? err.message : 'Discovery failed' });
      }
    }

    if (Date.now() - lastRpcRefreshAt >= RPC_REFRESH_INTERVAL_MS) { await enrichUSDGPools(); lastRpcRefreshAt = Date.now(); }
    if (Date.now() - lastVolumeRefreshAt >= VOLUME_REFRESH_INTERVAL_MS) { await refreshGlobalVolume(); lastVolumeRefreshAt = Date.now(); }
    if (Date.now() - lastSwapRefreshAt >= SWAP_REFRESH_INTERVAL_MS) { lastSwapRefreshAt = Date.now(); }

    const block = await getBlockNumber();
    indexerStore.setState({ status: 'live', lastIndexedBlock: block, lastIndexedTimestamp: Date.now(), poolsDiscovered: indexerStore.getAllPools().length, error: null });
  } catch (err) {
    indexerStore.setState({ status: indexerStore.getAllPools().length ? 'live' : 'error', error: err instanceof Error ? err.message : 'Indexer error' });
  } finally { indexerRunning = false; }
}

export async function syncPools(): Promise<void> {
  const pools = await fetchPoolsFromSubgraph();
  if (pools.length) { await processPools(pools); await enrichUSDGPools(); await refreshGlobalVolume(); }
  else await scanFactoryViaRPC();
}

export async function onNewBlock(blockNumber: number): Promise<{ updatedPools: string[]; newSwaps: IndexedSwap[] }> {
  await enrichUSDGPools();
  indexerStore.setState({ lastIndexedBlock: blockNumber, lastIndexedTimestamp: Date.now(), status: 'live' });
  return { updatedPools: indexerStore.getAllPools().map(p => p.address), newSwaps: [] };
}

export { FACTORY_ADDRESS, SUBGRAPH_URL, CHAIN_ID, priceFromBinId, estimateTvlFromUSDG };
