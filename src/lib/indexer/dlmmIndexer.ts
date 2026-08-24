/**
 * Ramses DLMM Indexer V15 — Robinhood Chain (4663)
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

const RPC_CONCURRENCY = Math.max(1, Number(process.env.DLMM_RPC_CONCURRENCY || 8));
const MAX_USDG_RPC_POOLS = Math.max(1, Number(process.env.DLMM_MAX_USDG_RPC_POOLS || 100));
const MAX_FACTORY_POOLS = Math.max(1, Number(process.env.DLMM_MAX_POOLS || 200));
const FACTORY_CONCURRENCY = Math.max(1, Number(process.env.DLMM_FACTORY_CONCURRENCY || 6));

// Volume is fetched globally, then aggregated locally. The pool-scoped fallback
// is intentionally small and only runs when the global query fails.
const SWAP_PAGE_SIZE = Math.min(1000, Math.max(100, Number(process.env.DLMM_SWAP_PAGE_SIZE || 1000)));
const SWAP_MAX_PAGES = Math.min(12, Math.max(1, Number(process.env.DLMM_SWAP_MAX_PAGES || 8)));
const SWAP_REFRESH_POOLS = Math.max(1, Number(process.env.DLMM_SWAP_REFRESH_POOLS || 12));
const GLOBAL_SWAP_LIMIT = Math.min(2000, Math.max(100, Number(process.env.DLMM_GLOBAL_SWAP_LIMIT || 1000)));
const GLOBAL_SWAP_MAX_PAGES = Math.min(20, Math.max(1, Number(process.env.DLMM_GLOBAL_SWAP_MAX_PAGES || 12)));
const VOLUME_FALLBACK_POOL_LIMIT = Math.min(25, Math.max(3, Number(process.env.DLMM_VOLUME_FALLBACK_POOLS || 12)));

let indexerRunning = false;
let lastDiscoveryAt = 0;
let lastRpcRefreshAt = 0;
let lastVolumeRefreshAt = 0;
const indexedSwapKeys = new Set<string>();

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
  id: string;
  pool: string;
  transaction?: string | null;
  timestamp: number;
  blockNumber?: number | null;
  tokenIn?: string | null;
  tokenOut?: string | null;
  amountIn?: string | null;
  amountOut?: string | null;
  amountUSD?: string | null;
  activeBinId?: number | null;
  [key: string]: unknown;
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
    volumeUSD1h: existing?.volumeUSD1h ?? 0, volumeUSD6h: existing?.volumeUSD6h ?? 0,
    volumeUSD24h: existing?.volumeUSD24h ?? 0,
    volumeToTVL: existing?.volumeToTVL ?? 0, volatility: existing?.volatility ?? 0,
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

// ─────────────────────────────────────────────────────────────────────────────
// Volume + volatility
//
// Primary path:
//   1) Query recent swaps globally.
//   2) Group by pool address locally (case-insensitive).
//   3) Calculate 1m/5m/15m/1h/6h/24h volume, swap counts and realized volatility.
//
// This is deliberately NOT one request per pool. It fixes the biggest source of
// latency in the previous implementation and also avoids pool-id casing issues.
//
// Fallback path:
//   If the global query is unavailable, refresh a small number of the most
//   useful pools with the known-working pool-scoped query.
// ─────────────────────────────────────────────────────────────────────────────

function safeTimestampSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Most subgraphs expose Unix seconds. Be tolerant if a provider returns ms.
  if (n > 100_000_000_000) return n / 1000;
  return n;
}

function swapPrice(s: SubgraphSwap, pool: IndexedPool): number | null {
  const bin = Number(s.activeBinId);
  if (Number.isFinite(bin) && bin > 0) {
    const p = priceFromBinId(bin, pool.binStep, pool.decimalsA, pool.decimalsB);
    if (p > 0) return p;
  }

  // Last-resort price from the swap amounts. This is only used when both
  // amountIn and amountOut are valid and token directions are known.
  const amountIn = Number(s.amountIn);
  const amountOut = Number(s.amountOut);
  if (!(amountIn > 0) || !(amountOut > 0)) return null;

  const inToken = String(s.tokenIn || '').toLowerCase();
  if (inToken === pool.tokenA.toLowerCase()) {
    const x = amountIn / 10 ** pool.decimalsA;
    const y = amountOut / 10 ** pool.decimalsB;
    return x > 0 && y > 0 ? y / x : null;
  }

  if (inToken === pool.tokenB.toLowerCase()) {
    const y = amountIn / 10 ** pool.decimalsB;
    const x = amountOut / 10 ** pool.decimalsA;
    return x > 0 && y > 0 ? x / y : null;
  }

  return null;
}

function calculateRealizedVolatility(pool: IndexedPool, swaps: SubgraphSwap[], now = Date.now()): number {
  const cutoff = now - 24 * 60 * 60_000;

  const points = swaps
    .map(s => {
      const ts = safeTimestampSeconds(s.timestamp) * 1000;
      const price = swapPrice(s, pool);
      return { ts, price };
    })
    .filter(p => p.ts >= cutoff && p.price != null && p.price > 0)
    .sort((a, b) => a.ts - b.ts);

  if (points.length < 3) return 0;

  // Collapse repeated prices and calculate log returns. Using observed
  // timestamps makes this a true 24h realized-volatility estimate rather than
  // a binStep-based placeholder.
  const returns: number[] = [];
  let previousPrice = points[0].price as number;

  for (let i = 1; i < points.length; i++) {
    const current = points[i].price as number;
    if (!(current > 0) || !(previousPrice > 0)) continue;
    if (current === previousPrice) continue;

    const r = Math.log(current / previousPrice);
    if (Number.isFinite(r)) returns.push(r);
    previousPrice = current;
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const perObservationStd = Math.sqrt(Math.max(0, variance));

  // The UI labels this metric "24h price volatility" / "Price std dev".
  // Keep it in the same natural percent scale instead of annualising per-swap
  // returns, which can wildly exaggerate volatility for very active pools.
  const realized = perObservationStd * 100;
  return Number.isFinite(realized) ? Math.min(100, Math.max(0, realized)) : 0;
}

function computeAnalytics(pool: IndexedPool): Partial<IndexedPool> {
  const vol24 = pool.volumeUSD24h ?? pool.volume24h ?? 0;
  const tvl = pool.tvl ?? 0;
  const vtl = tvl > 0 ? vol24 / tvl : 0;
  const apr = tvl > 0 && vol24 > 0 ? (pool.fee / 100) * vol24 * 365 / tvl * 100 : null;

  // The score is intentionally deterministic and never treats missing volume
  // as real volume. A pool with no swaps gets 0 Vol/TVL, not fake activity.
  let score = 20;
  if (tvl > 0) score += 10;
  if (tvl >= 1_000) score += 10;
  if (tvl >= 10_000) score += 10;
  if (vol24 > 0) score += 10;
  if (vtl >= 0.1) score += 10;
  if (vtl >= 1) score += 10;
  if (vtl >= 5) score += 5;
  if (pool.swapCount1h >= 5) score += 5;
  if (pool.swapCount1h >= 25) score += 5;
  if (pool.status === 'active') score += 5;

  // High realized volatility is a risk factor, so it reduces the score.
  if (pool.volatility > 20) score -= 15;
  else if (pool.volatility > 10) score -= 10;
  else if (pool.volatility > 6) score -= 5;

  const riskLevel: IndexedPool['riskLevel'] =
    pool.volatility > 20 || pool.binStep >= 50 ? 'EXTREME' :
    pool.volatility > 10 || pool.binStep >= 20 ? 'HIGH' :
    pool.volatility > 6 || pool.binStep >= 10 ? 'MEDIUM' : 'LOW';

  return {
    volumeToTVL: vtl,
    estimatedAPR: apr,
    analyticsScore: Math.max(0, Math.min(100, score)),
    riskLevel,
  };
}


// The Robinhood/Kingdom DLMMSwap schema is not identical to older DLMM
// subgraphs. V15 introspects the live schema once and builds the selection
// dynamically, so a missing optional field can never invalidate the query.
let dlmmSwapFieldsCache: Set<string> | null = null;
let dlmmSwapIntrospectionError = '';

async function getDLMMSwapFields(): Promise<Set<string>> {
  if (dlmmSwapFieldsCache) return dlmmSwapFieldsCache;
  const query = `
    query IntrospectDLMMSwap {
      __type(name: "DLMMSwap") {
        fields { name }
      }
    }
  `;
  try {
    const data = await subgraphQuery(query) as { __type?: { fields?: Array<{ name: string }> } | null };
    const fields = new Set((data.__type?.fields ?? []).map(f => f.name));
    if (!fields.size) throw new Error('Subgraph introspection returned no DLMMSwap fields');
    dlmmSwapFieldsCache = fields;
    console.log('[DLMM V15] DLMMSwap schema:', Array.from(fields).sort());
    return fields;
  } catch (err) {
    dlmmSwapIntrospectionError = err instanceof Error ? err.message : String(err);
    // These are the only fields that earlier production responses have
    // established as part of this project's DLMMSwap payload. Keep the
    // fallback deliberately minimal; never guess tokenIn/tokenOut/blockNumber.
    dlmmSwapFieldsCache = new Set(['id', 'pool', 'transaction', 'timestamp', 'amountUSD']);
    console.log('[DLMM V15] DLMMSwap introspection unavailable:', dlmmSwapIntrospectionError);
    return dlmmSwapFieldsCache;
  }
}

function chooseField(fields: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) if (fields.has(candidate)) return candidate;
  return null;
}

function buildDLMMSwapSelection(fields: Set<string>): { selection: string; map: Record<string, string> } {
  const candidates: Record<string, string[]> = {
    id: ['id'],
    pool: ['pool'],
    transaction: ['transaction', 'txHash', 'transactionHash'],
    timestamp: ['timestamp', 'createdAtTimestamp'],
    amountUSD: ['amountUSD'],
    activeBinId: ['activeBinId', 'activeId'],
    tokenIn: ['tokenIn', 'inputToken', 'tokenInAddress'],
    tokenOut: ['tokenOut', 'outputToken', 'tokenOutAddress'],
    amountIn: ['amountIn', 'inputAmount'],
    amountOut: ['amountOut', 'outputAmount'],
    blockNumber: ['blockNumber', 'createdAtBlockNumber'],
  };
  const map: Record<string, string> = {};
  const selected: string[] = [];
  for (const [logical, names] of Object.entries(candidates)) {
    const actual = chooseField(fields, names);
    if (actual) { map[logical] = actual; selected.push(actual); }
  }
  // id/pool/timestamp are required by the local aggregator. If the live
  // schema lacks one of them, fail explicitly rather than silently fabricating.
  for (const required of ['id', 'pool', 'timestamp']) {
    if (!map[required]) throw new Error(`DLMMSwap required field missing: ${required}`);
  }
  return { selection: Array.from(new Set(selected)).join(' '), map };
}

function normalizeSwapRow(row: Record<string, unknown>, map: Record<string, string>): SubgraphSwap {
  const get = (logical: string) => map[logical] ? row[map[logical]] : undefined;
  return {
    id: String(get('id') ?? ''),
    pool: String(get('pool') ?? ''),
    transaction: get('transaction') == null ? null : String(get('transaction')),
    timestamp: Number(get('timestamp') ?? 0),
    blockNumber: get('blockNumber') == null ? 0 : Number(get('blockNumber')),
    tokenIn: get('tokenIn') == null ? null : String(get('tokenIn')),
    tokenOut: get('tokenOut') == null ? null : String(get('tokenOut')),
    amountIn: get('amountIn') == null ? null : String(get('amountIn')),
    amountOut: get('amountOut') == null ? null : String(get('amountOut')),
    amountUSD: get('amountUSD') == null ? null : String(get('amountUSD')),
    activeBinId: get('activeBinId') == null ? null : Number(get('activeBinId')),
  };
}

async function fetchDLMMSwaps(queryArgs: Record<string, unknown>, queryBody: string): Promise<SubgraphSwap[]> {
  const fields = await getDLMMSwapFields();
  const built = buildDLMMSwapSelection(fields);
  const query = queryBody.replace('__DLMM_SWAP_SELECTION__', built.selection);
  const data = await subgraphQuery(query, queryArgs) as { DLMMSwap?: Array<Record<string, unknown>> };
  return (data.DLMMSwap ?? []).map(row => normalizeSwapRow(row, built.map));
}

async function fetchRecentSwapsForPool(poolId: string, limit = 100): Promise<SubgraphSwap[]> {
  const query = `
    query GetSwaps($poolId: String!, $chainId: Int!, $limit: Int!) {
      DLMMSwap(
        where: { pool: { _eq: $poolId }, chainId: { _eq: $chainId } }
        limit: $limit
        order_by: { timestamp: desc }
      ) { __DLMM_SWAP_SELECTION__ }
    }
  `;
  return fetchDLMMSwaps({ poolId, chainId: CHAIN_ID, limit }, query);
}

async function fetchRecentSwapsGlobalFiltered(cutoffSeconds: number): Promise<SubgraphSwap[]> {
  const query = `
    query GetRecentSwaps($since: Int!, $chainId: Int!, $limit: Int!) {
      DLMMSwap(
        where: { chainId: { _eq: $chainId }, timestamp: { _gte: $since } }
        limit: $limit
        order_by: { timestamp: desc }
      ) { __DLMM_SWAP_SELECTION__ }
    }
  `;
  return fetchDLMMSwaps({ since: cutoffSeconds, chainId: CHAIN_ID, limit: GLOBAL_SWAP_LIMIT }, query);
}

async function fetchRecentSwapsGlobalPaged(cutoffSeconds: number): Promise<SubgraphSwap[]> {
  const all: SubgraphSwap[] = [];
  const query = `
    query GetRecentSwaps($chainId: Int!, $limit: Int!, $offset: Int!) {
      DLMMSwap(
        where: { chainId: { _eq: $chainId } }
        limit: $limit
        offset: $offset
        order_by: { timestamp: desc }
      ) { __DLMM_SWAP_SELECTION__ }
    }
  `;
  for (let page = 0; page < GLOBAL_SWAP_MAX_PAGES; page++) {
    const rows = await fetchDLMMSwaps({ chainId: CHAIN_ID, limit: SWAP_PAGE_SIZE, offset: page * SWAP_PAGE_SIZE }, query);
    all.push(...rows);
    if (rows.length < SWAP_PAGE_SIZE) break;
    const oldest = rows.reduce((min, s) => {
      const ts = safeTimestampSeconds(s.timestamp);
      return ts > 0 ? Math.min(min, ts) : min;
    }, Number.MAX_SAFE_INTEGER);
    if (oldest <= cutoffSeconds) break;
  }
  return all.filter(s => safeTimestampSeconds(s.timestamp) >= cutoffSeconds);
}

interface GlobalSwapResult {
  swaps: SubgraphSwap[];
  complete: boolean;
  source: 'global-filtered' | 'global-paged' | 'pool-fallback';
  error?: string;
}

async function fetchGlobalRecentSwaps(cutoffSeconds: number): Promise<GlobalSwapResult> {
  try {
    const rows = await fetchRecentSwapsGlobalFiltered(cutoffSeconds);
    return {
      swaps: rows.filter(s => safeTimestampSeconds(s.timestamp) >= cutoffSeconds),
      complete: rows.length < GLOBAL_SWAP_LIMIT,
      source: 'global-filtered',
    };
  } catch (firstError) {
    try {
      const rows = await fetchRecentSwapsGlobalPaged(cutoffSeconds);
      return {
        swaps: rows,
        complete: rows.length < SWAP_PAGE_SIZE * GLOBAL_SWAP_MAX_PAGES,
        source: 'global-paged',
        error: firstError instanceof Error ? firstError.message : String(firstError),
      };
    } catch (secondError) {
      return {
        swaps: [],
        complete: false,
        source: 'pool-fallback',
        error: secondError instanceof Error ? secondError.message : String(secondError),
      };
    }
  }
}

function calculateSwapUSD(s: SubgraphSwap, pool: IndexedPool): number | null {
  // Prefer the indexer's own USD valuation when present. Some swaps have a
  // null amountUSD, so do not let one unpriced row invalidate the whole pool.
  const direct = numOrNull(s.amountUSD);
  if (direct != null && direct > 0) return direct;

  const tokenIn = String(s.tokenIn || '').toLowerCase();
  const tokenOut = String(s.tokenOut || '').toLowerCase();
  const tokenA = pool.tokenA.toLowerCase();
  const tokenB = pool.tokenB.toLowerCase();
  const aIsUSDG = isUSDGToken(pool.tokenA);
  const bIsUSDG = isUSDGToken(pool.tokenB);

  // For USDG pairs, the USDG leg is the most reliable fallback because USDG
  // is treated as $1 here. This works even when currentPrice is unavailable.
  const amountInRaw = Number(s.amountIn);
  const amountOutRaw = Number(s.amountOut);

  if (aIsUSDG && tokenIn === tokenA && Number.isFinite(amountInRaw) && amountInRaw > 0) {
    return amountInRaw / 10 ** pool.decimalsA;
  }
  if (bIsUSDG && tokenIn === tokenB && Number.isFinite(amountInRaw) && amountInRaw > 0) {
    return amountInRaw / 10 ** pool.decimalsB;
  }
  if (aIsUSDG && tokenOut === tokenA && Number.isFinite(amountOutRaw) && amountOutRaw > 0) {
    return amountOutRaw / 10 ** pool.decimalsA;
  }
  if (bIsUSDG && tokenOut === tokenB && Number.isFinite(amountOutRaw) && amountOutRaw > 0) {
    return amountOutRaw / 10 ** pool.decimalsB;
  }

  // Last resort for a USDG pair: value the non-stable leg using the current
  // pool price. This is less authoritative than the USDG amount but still
  // useful when the swap payload is missing its stable-side amount.
  if (Number.isFinite(amountInRaw) && amountInRaw > 0 && (pool.currentPrice ?? 0) > 0) {
    if (tokenIn === tokenA && bIsUSDG) return (amountInRaw / 10 ** pool.decimalsA) * (pool.currentPrice as number);
    if (tokenIn === tokenB && aIsUSDG) return (amountInRaw / 10 ** pool.decimalsB) / (pool.currentPrice as number);
  }

  return null;
}

interface PoolVolumeResult {
  pool: IndexedPool;
  swaps: SubgraphSwap[];
  volume1m: number;
  volume5m: number;
  volume15m: number;
  volume1h: number;
  volume6h: number;
  volume24h: number;
  swapCount1h: number;
  swapCount24h: number;
  usdComplete: boolean;
  valuedSwapCount: number;
  totalSwapCount: number;
}

function aggregatePoolSwaps(pool: IndexedPool, swaps: SubgraphSwap[], now = Date.now()): PoolVolumeResult & { volatility: number } {
  const h1 = now - 60 * 60_000;
  const h6 = now - 6 * 60 * 60_000;
  const h24 = now - 24 * 60 * 60_000;
  const m1 = now - 60_000;
  const m5 = now - 5 * 60_000;
  const m15 = now - 15 * 60_000;

  let volume1m = 0;
  let volume5m = 0;
  let volume15m = 0;
  let volume1h = 0;
  let volume6h = 0;
  let volume24h = 0;
  let swapCount1h = 0;
  let swapCount24h = 0;
  let usdComplete = true;
  let valuedSwapCount = 0;

  for (const s of swaps) {
    const t = safeTimestampSeconds(s.timestamp) * 1000;
    if (!t || t < h24) continue;

    // Swap counts are independent from USD valuation. A swap with a missing
    // amountUSD still counts as activity; only the USD volume contribution is
    // omitted when it cannot be valued safely.
    swapCount24h++;
    if (t >= h1) swapCount1h++;

    const usd = calculateSwapUSD(s, pool);
    if (usd == null) {
      usdComplete = false;
      continue;
    }

    valuedSwapCount++;
    volume24h += usd;
    if (t >= h6) volume6h += usd;
    if (t >= m15) volume15m += usd;
    if (t >= m5) volume5m += usd;
    if (t >= m1) volume1m += usd;
    if (t >= h1) volume1h += usd;
  }

  return {
    pool,
    swaps,
    volume1m,
    volume5m,
    volume15m,
    volume1h,
    volume6h,
    volume24h,
    swapCount1h,
    swapCount24h,
    usdComplete,
    volatility: calculateRealizedVolatility(pool, swaps, now),
    valuedSwapCount,
    totalSwapCount: swapCount24h,
  };
}

async function refreshPoolVolumes(): Promise<void> {
  const all = indexerStore.getAllPools().filter(p => p.status === 'active');
  if (!all.length) return;

  const now = Date.now();
  const cutoffSeconds = Math.floor(now / 1000) - 24 * 60 * 60;
  const global = await fetchGlobalRecentSwaps(cutoffSeconds);

  let success = 0;
  let failed = 0;
  let swapsSeen = global.swaps.length;
  let usdPools = 0;
  let partialUsdPools = 0;
  let firstError = global.error || '';

  // Fast path: one global dataset, local aggregation for every pool.
  if (global.swaps.length > 0) {
    const byPool = new Map<string, SubgraphSwap[]>();

    for (const swap of global.swaps) {
      const key = String(swap.pool || '').toLowerCase();
      if (!key) continue;
      const list = byPool.get(key);
      if (list) list.push(swap);
      else byPool.set(key, [swap]);
    }

    for (const pool of all) {
      try {
        const swaps = byPool.get(pool.address.toLowerCase()) ?? [];
        const result = aggregatePoolSwaps(pool, swaps, now);

        const updated: IndexedPool = {
          ...pool,
          volume1m: result.volume1m,
          volume5m: result.volume5m,
          volume15m: result.volume15m,
          volume1h: result.volume1h,
          volume6h: result.volume6h,
          volume24h: result.volume24h,
          volumeUSD1h: result.valuedSwapCount > 0 ? result.volume1h : null,
          volumeUSD6h: result.valuedSwapCount > 0 ? result.volume6h : null,
          volumeUSD24h: result.valuedSwapCount > 0 ? result.volume24h : null,
          swapCount1h: result.swapCount1h,
          swapCount24h: result.swapCount24h,
          volatility: result.volatility,
          updatedAt: Date.now(),
        };

        Object.assign(updated, computeAnalytics(updated));
        indexerStore.upsertPool(updated);

        if (result.usdComplete || swaps.length === 0) usdPools++;
        else if (result.valuedSwapCount > 0) partialUsdPools++;

        for (const s of swaps.slice(0, 250)) {
          const ts = safeTimestampSeconds(s.timestamp);
          if (!ts || ts * 1000 < now - 24 * 60 * 60_000) continue;

          const swapKey = `${pool.address.toLowerCase()}:${s.id || s.transaction}:${ts}`;
          if (indexedSwapKeys.has(swapKey)) continue;

          indexedSwapKeys.add(swapKey);
          indexerStore.addSwap({
            poolAddress: pool.address,
            txHash: s.transaction || s.id,
            blockNumber: Number(s.blockNumber ?? 0),
            timestamp: ts,
            tokenIn: s.tokenIn || '',
            tokenOut: s.tokenOut || '',
            amountIn: s.amountIn || '0',
            amountOut: s.amountOut || '0',
            activeBinAfter: Number(s.activeBinId),
            price: swapPrice(s, updated),
            volumeUSD: calculateSwapUSD(s, updated),
          });
        }

        success++;
      } catch (err) {
        failed++;
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
      }
    }

    if (indexedSwapKeys.size > 25_000) indexedSwapKeys.clear();

    console.log('[DLMM V15] volume refresh:', {
      selected: all.length,
      success,
      failed,
      swapsSeen,
      usdPools,
      source: global.source,
      globalComplete: global.complete,
      firstError: firstError || null,
      introspectionError: dlmmSwapIntrospectionError || null,
      schemaFields: dlmmSwapFieldsCache ? Array.from(dlmmSwapFieldsCache).sort() : [],
    });
    return;
  }

  // Fallback: global indexing failed, so do not leave the whole table blank.
  // Only the most useful pools are queried individually to keep latency bounded.
  const selected = [...all]
    .sort((a, b) => {
      const aAge = a.createdTimestamp > 0 ? now / 1000 - a.createdTimestamp : Number.MAX_SAFE_INTEGER;
      const bAge = b.createdTimestamp > 0 ? now / 1000 - b.createdTimestamp : Number.MAX_SAFE_INTEGER;
      const aNew = aAge <= 24 * 3600 ? 1 : 0;
      const bNew = bAge <= 24 * 3600 ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return (b.tvl ?? 0) - (a.tvl ?? 0);
    })
    .slice(0, Math.min(VOLUME_FALLBACK_POOL_LIMIT, all.length));

  await mapWithConcurrency(selected, RPC_CONCURRENCY, async pool => {
    try {
      const swaps = await fetchRecentSwapsForPool(pool.address.toLowerCase(), 250);
      const result = aggregatePoolSwaps(pool, swaps, Date.now());

      const updated: IndexedPool = {
        ...pool,
        volume1m: result.volume1m,
        volume5m: result.volume5m,
        volume15m: result.volume15m,
        volume1h: result.volume1h,
        volume6h: result.volume6h,
        volume24h: result.volume24h,
        volumeUSD1h: result.valuedSwapCount > 0 ? result.volume1h : null,
        volumeUSD6h: result.valuedSwapCount > 0 ? result.volume6h : null,
        volumeUSD24h: result.valuedSwapCount > 0 ? result.volume24h : null,
        swapCount1h: result.swapCount1h,
        swapCount24h: result.swapCount24h,
        volatility: result.volatility,
        updatedAt: Date.now(),
      };

      Object.assign(updated, computeAnalytics(updated));
      indexerStore.upsertPool(updated);
      success++;
      swapsSeen += swaps.length;
      if (result.usdComplete || swaps.length === 0) usdPools++;
      else if (result.valuedSwapCount > 0) partialUsdPools++;
    } catch (err) {
      failed++;
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  });

  console.log('[DLMM V15] volume refresh:', {
    selected: selected.length,
    success,
    failed,
    swapsSeen,
    usdPools,
    partialUsdPools,
    source: 'pool-fallback',
    globalComplete: false,
    firstError: firstError || null,
    introspectionError: dlmmSwapIntrospectionError || null,
    schemaFields: dlmmSwapFieldsCache ? Array.from(dlmmSwapFieldsCache).sort() : [],
  });
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
        volumeUSD24h: existing?.volumeUSD24h ?? null, volumeToTVL: 0, volatility: existing?.volatility ?? 0, analyticsScore: existing?.analyticsScore ?? 20,
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
    if (Date.now() - lastVolumeRefreshAt >= VOLUME_REFRESH_INTERVAL_MS) { await refreshPoolVolumes(); lastVolumeRefreshAt = Date.now(); }

    const block = await getBlockNumber();
    indexerStore.setState({ status: 'live', lastIndexedBlock: block, lastIndexedTimestamp: Date.now(), poolsDiscovered: indexerStore.getAllPools().length, error: null });
  } catch (err) {
    indexerStore.setState({ status: indexerStore.getAllPools().length ? 'live' : 'error', error: err instanceof Error ? err.message : 'Indexer error' });
  } finally { indexerRunning = false; }
}

export async function syncPools(): Promise<void> {
  const pools = await fetchPoolsFromSubgraph();
  if (pools.length) { await processPools(pools); await enrichUSDGPools(); await refreshPoolVolumes(); }
  else await scanFactoryViaRPC();
}

export async function onNewBlock(blockNumber: number): Promise<{ updatedPools: string[]; newSwaps: IndexedSwap[] }> {
  await enrichUSDGPools();
  indexerStore.setState({ lastIndexedBlock: blockNumber, lastIndexedTimestamp: Date.now(), status: 'live' });
  return { updatedPools: indexerStore.getAllPools().map(p => p.address), newSwaps: [] };
}

export { FACTORY_ADDRESS, SUBGRAPH_URL, CHAIN_ID, priceFromBinId, estimateTvlFromUSDG };
