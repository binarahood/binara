/**
 * Ramses DLMM Indexer V8 for Robinhood Chain (Chain ID 4663)
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
 *
 * V8 fixes USDG TVL source precedence and adds a reserve-ratio price fallback when the bin price is unavailable or invalid.
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
const USDG_DECIMALS = 6;
const USDG_USD_PRICE = 1;

// Ramses DLMM Factory ABI fragments (minimal, for eth_call)
const FACTORY_GET_NUMBER_OF_LB_PAIRS = '0x4e937c3a'; // getNumberOfLBPairs()
const FACTORY_GET_LB_PAIR_AT_INDEX = '0x7daf5d66'; // getLBPairAtIndex(uint256)

// LBPair ABI selectors (for eth_call)
const LBPAIR_GET_ACTIVE_ID = '0xdbe65edc';
const LBPAIR_GET_RESERVES = '0x0902f1ac';
const LBPAIR_GET_BIN = '0xf7888aec'; // getBin(uint24)
const LBPAIR_GET_NEXT_NON_EMPTY_BIN = '0xa41a01fb'; // getNextNonEmptyBin(bool,uint24)
const LBPAIR_GET_STATIC_FEE = '0x7ca0de30';       // getStaticFeeParameters()
const LBPAIR_TOKEN_X = '0x05e8746d';              // getTokenX() returns (address)
const LBPAIR_TOKEN_Y = '0xda10610c';              // getTokenY() returns (address)
const LBPAIR_BIN_STEP = '0x17f11ecc';             // getBinStep() returns (uint16)

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
function rawPriceFromBinId(binId: number, binStep: number): number {
  const base = 1 + binStep / 10_000;
  const exponent = binId - 8_388_608;
  const price = Math.pow(base, exponent);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/**
 * Convert the DLMM bin price (raw tokenY units per raw tokenX unit) into
 * a human-readable tokenY-per-tokenX price. LBPair's price formula is
 * independent of ERC-20 decimals, so decimal normalization is mandatory
 * when pairs such as WETH/USDG are used (18 vs 6 decimals).
 */
function priceFromBinId(
  binId: number,
  binStep: number,
  decimalsA = 18,
  decimalsB = 18,
): number {
  const base = 1 + binStep / 10_000;
  const exponent = binId - 8_388_608;

  const rawPrice = Math.pow(base, exponent);

  // DLMM bin price is expressed in raw token units.
  // Convert it into human-readable token units.
  const decimalAdjustment = Math.pow(
    10,
    decimalsA - decimalsB,
  );

  return rawPrice * decimalAdjustment;
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
    const meta = { symbol: 'USDG', decimals: USDG_DECIMALS };
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
    const data = await subgraphQuery(query, {
      poolId: poolId.toLowerCase(),
      chainId: CHAIN_ID,
      h1,
      h6,
      h24,
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

// ─── Lightweight USD valuation fallback ────────────────────────────────────────
/**
 * Estimate TVL when the subgraph does not provide totalValueLockedUSD.
 *
 * This is intentionally conservative: only pools containing USDG are valued,
 * because USDG is the one quote asset we can treat as approximately $1 here.
 * For all other pairs we return null rather than inventing a USD price.
 */
function isUSDGToken(address: string): boolean {
  return address.toLowerCase() === USDG_ADDRESS.toLowerCase();
}

function humanReserve(raw: string, decimals: number): number {
  try {
    const value = BigInt(raw || '0');
    const n = Number(value);
    const result = n / 10 ** decimals;
    return Number.isFinite(result) && result >= 0 ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * If the bin price is missing, use the pool's own reserve ratio as a last-resort
 * price estimate for USDG pairs. This is not used for non-USDG pools.
 *
 * For X/USDG: priceXInY = reserveY / reserveX.
 * For USDG/Y: priceXInY = reserveX / reserveY (because priceXInY means
 * USDG-per-Y, while reserveX is USDG and reserveY is Y).
 */
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

/**
 * Estimate USD TVL for USDG pools from live reserves.
 *
 * IMPORTANT: For USDG pairs we intentionally prefer this on-chain estimate
 * over subgraph totalValueLockedUSD. The subgraph value can lag or be stale,
 * while the reserves are read directly from the LBPair contract.
 */
function estimateTvlFromUSDG(
  tokenX: string,
  tokenY: string,
  decimalsX: number,
  decimalsY: number,
  reserveX: string,
  reserveY: string,
  binPriceXInY: number,
): TvlEstimate {
  try {
    const x = humanReserve(reserveX, decimalsX);
    const y = humanReserve(reserveY, decimalsY);
    if (x <= 0 && y <= 0) {
      return { tvl: null, priceXInY: 0, source: 'none' };
    }

    const isXUSDG = isUSDGToken(tokenX);
    const isYUSDG = isUSDGToken(tokenY);
    if (!isXUSDG && !isYUSDG) {
      return { tvl: null, priceXInY: 0, source: 'none' };
    }

    let priceXInY = Number.isFinite(binPriceXInY) && binPriceXInY > 0
      ? binPriceXInY
      : 0;
    let source: TvlEstimate['source'] = priceXInY > 0 ? 'bin' : 'none';

    // A reserve-ratio fallback guarantees USDG pools can still show a TVL
    // when the active-bin read is unavailable or produces an unusable value.
    if (priceXInY <= 0) {
      priceXInY = priceFromUSDGReserveRatio(
        tokenX, tokenY, decimalsX, decimalsY, reserveX, reserveY,
      );
      if (priceXInY > 0) source = 'reserve-ratio';
    }

    if (isYUSDG && !isXUSDG) {
      if (priceXInY > 0) {
        const value = x * priceXInY + y;
        if (Number.isFinite(value) && value > 0) {
          return { tvl: value, priceXInY, source };
        }
      }
      return y > 0
        ? { tvl: y * USDG_USD_PRICE, priceXInY: 0, source: 'stable-side-only' }
        : { tvl: null, priceXInY: 0, source: 'none' };
    }

    if (isXUSDG && !isYUSDG) {
      if (priceXInY > 0) {
        const tokenYPriceUSD = 1 / priceXInY;
        const value = x + y * tokenYPriceUSD;
        if (Number.isFinite(value) && value > 0) {
          return { tvl: value, priceXInY, source };
        }
      }
      return x > 0
        ? { tvl: x * USDG_USD_PRICE, priceXInY: 0, source: 'stable-side-only' }
        : { tvl: null, priceXInY: 0, source: 'none' };
    }

    return { tvl: null, priceXInY: 0, source: 'none' };
  } catch {
    return { tvl: null, priceXInY: 0, source: 'none' };
  }
}

// ─── Pool enrichment via RPC ──────────────────────────────────────────────────

async function enrichPoolFromRPC(
  pool: IndexedPool
): Promise<Partial<IndexedPool>> {
  try {
    // ============================================================
    // 1. Get active bin
    // ============================================================
    const activeIdHex = await ethCall(
      pool.address,
      LBPAIR_GET_ACTIVE_ID
    );

    const activeBin = decodeUint24(activeIdHex);

    // ============================================================
    // 2. Get latest token decimals
    // ============================================================
    let decimalsA = pool.decimalsA ?? 18;
    let decimalsB = pool.decimalsB ?? 18;

    try {
      const [metaA, metaB] = await Promise.all([
        getTokenMetadata(pool.tokenA),
        getTokenMetadata(pool.tokenB),
      ]);

      decimalsA = metaA.decimals;
      decimalsB = metaB.decimals;
    } catch {
      // Keep existing decimals if metadata lookup fails.
    }

    // ============================================================
    // 3. Calculate human-readable price
    // ============================================================
    const currentPrice = priceFromBinId(
      activeBin,
      pool.binStep,
      decimalsA,
      decimalsB
    );

    // ============================================================
    // 4. Get total reserves
    // ============================================================
    let reserveX = pool.reserveX;
    let reserveY = pool.reserveY;

    try {
      const reservesHex = await ethCall(
        pool.address,
        LBPAIR_GET_RESERVES
      );

      const clean = reservesHex.startsWith('0x')
        ? reservesHex.slice(2)
        : reservesHex;

      if (clean.length >= 128) {
        reserveX = BigInt(
          '0x' + clean.slice(0, 64)
        ).toString();

        reserveY = BigInt(
          '0x' + clean.slice(64, 128)
        ).toString();
      }
    } catch {
      // Keep existing reserves if RPC reserve call fails.
    }

    console.log(
      `[RPC DEBUG] ${pool.pair} FINAL:`,
      {
        activeBin,
        currentPrice,
        reserveX,
        reserveY,
        decimalsA,
        decimalsB,
      }
    );

    return {
      activeBin,
      currentPrice,
      reserveX,
      reserveY,
      decimalsA,
      decimalsB,
      updatedAt: Date.now(),
    };
  } catch (err) {
    console.error(
      `[RPC DEBUG] ${pool.pair} enrichment FAILED:`,
      err
    );

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

      const parsedSubgraphTvl = sp.totalValueLockedUSD ? parseFloat(sp.totalValueLockedUSD) : NaN;
      const subgraphTvlUSD = Number.isFinite(parsedSubgraphTvl) && parsedSubgraphTvl > 0 ? parsedSubgraphTvl : null;
      const vol24hUSD = sp.volumeUSD ? parseFloat(sp.volumeUSD) : null;

      // Active bin and price
      let activeBin = sp.activeId ?? null;
      let currentPrice: number | null = null;
      if (activeBin !== null) {
        currentPrice = priceFromBinId(activeBin, sp.binStep, decimalsA, decimalsB);
      }

      const tvlEstimate = estimateTvlFromUSDG(
        sp.tokenX.id,
        sp.tokenY.id,
        decimalsA,
        decimalsB,
        sp.reserveX || '0',
        sp.reserveY || '0',
        currentPrice ?? 0,
      );

      const hasUSDG = isUSDGToken(sp.tokenX.id) || isUSDGToken(sp.tokenY.id);
      // For USDG pools, trust live reserve-based valuation first. For other
      // pools, retain the subgraph's USD TVL when it is available.
      const tvlUSD = hasUSDG
        ? tvlEstimate.tvl
        : subgraphTvlUSD;

      // If the bin price is unavailable, expose the reserve-ratio estimate so
      // USDG pools do not remain N/A while their reserves are non-zero.
      if ((!currentPrice || !Number.isFinite(currentPrice)) && tvlEstimate.priceXInY > 0) {
        currentPrice = tvlEstimate.priceXInY;
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

if (Object.keys(rpcData).length > 0) {
  const updated: IndexedPool = {
    ...pool,
    ...rpcData,
  };

  // Recalculate USDG TVL from the latest on-chain reserves.
  if (updated.reserveX && updated.reserveY) {
    const tvlEstimate = estimateTvlFromUSDG(
      updated.tokenA,
      updated.tokenB,
      updated.decimalsA,
      updated.decimalsB,
      updated.reserveX,
      updated.reserveY,
      updated.currentPrice ?? 0
    );

    if (tvlEstimate.tvl != null) {
      updated.tvl = tvlEstimate.tvl;
    }

    if (
      (!updated.currentPrice ||
        !Number.isFinite(updated.currentPrice)) &&
      tvlEstimate.priceXInY > 0
    ) {
      updated.currentPrice = tvlEstimate.priceXInY;
    }
  }

  // Recalculate analytics using the newest TVL.
  const analytics = computeAnalytics(updated);

  indexerStore.upsertPool({
    ...updated,
    ...analytics,
  });

  updatedPools.push(pool.address);
}
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
              price: s.activeBinId ? priceFromBinId(s.activeBinId, pool.binStep, pool.decimalsA, pool.decimalsB) : null,
              volumeUSD: s.amountUSD ? parseFloat(s.amountUSD) : null,
            };
            indexerStore.addSwap(swap);
          }
        } catch { /* skip */ }
      })
    );
  }
}

// Fallback: discover every LBPair directly from the Ramses DLMM factory.
// The factory exposes an indexed array through getNumberOfLBPairs() and
// getLBPairAtIndex(uint256), so this does not depend on a subgraph.
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

  // Keep RPC load reasonable on a serverless deployment.
  const maxPairs = Math.min(count, Number(process.env.DLMM_MAX_POOLS || 200));
  const concurrency = 5;

  for (let start = 0; start < maxPairs; start += concurrency) {
    const indices = Array.from(
      { length: Math.min(concurrency, maxPairs - start) },
      (_, offset) => start + offset
    );

    await Promise.allSettled(indices.map(async (index) => {
      try {
        const pairHex = await ethCall(
          FACTORY_ADDRESS,
          FACTORY_GET_LB_PAIR_AT_INDEX + BigInt(index).toString(16).padStart(64, '0')
        );
        const pairAddress = decodeAddress(pairHex);
        if (/^0x0+$/.test(pairAddress) || pairAddress.length !== 42) return;

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
        const cleanReserves = reservesHex.startsWith('0x') ? reservesHex.slice(2) : reservesHex;
        const reserveX = cleanReserves.length >= 128
          ? BigInt('0x' + cleanReserves.slice(0, 64)).toString()
          : '0';
        const reserveY = cleanReserves.length >= 128
          ? BigInt('0x' + cleanReserves.slice(64, 128)).toString()
          : '0';

        const [metaX, metaY] = await Promise.all([
          getTokenMetadata(tokenX),
          getTokenMetadata(tokenY),
        ]);

        const currentPrice = priceFromBinId(activeBin, binStep, metaX.decimals, metaY.decimals);
        const existing = indexerStore.getPool(pairAddress);
        const baseFeePercent = binStep * 0.01;
        const tvlEstimate = estimateTvlFromUSDG(
          tokenX,
          tokenY,
          metaX.decimals,
          metaY.decimals,
          reserveX,
          reserveY,
          currentPrice,
        );
        const effectivePrice = currentPrice || tvlEstimate.priceXInY || null;

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
          currentPrice: effectivePrice,
          fee: baseFeePercent,
          reserveX,
          reserveY,
          // Factory/RPC discovery has no subgraph TVL in this path, so use the
          // live USDG reserve valuation when possible.
          tvl: tvlEstimate.tvl ?? existing?.tvl ?? null,
          volume1m: existing?.volume1m ?? 0,
          volume5m: existing?.volume5m ?? 0,
          volume15m: existing?.volume15m ?? 0,
          volume1h: existing?.volume1h ?? 0,
          volume6h: existing?.volume6h ?? 0,
          volume24h: existing?.volume24h ?? 0,
          volumeUSD1h: existing?.volumeUSD1h ?? null,
          volumeUSD6h: existing?.volumeUSD6h ?? null,
          volumeUSD24h: existing?.volumeUSD24h ?? null,
          volumeToTVL: existing?.volumeToTVL ?? 0,
          volatility: binStep * 0.5,
          analyticsScore: 55,
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
        // A malformed/stale pair should not prevent discovery of the remaining pools.
      }
    }));
  }

  indexerStore.setState({
    poolsDiscovered: indexerStore.getAllPools().length,
    error: null,
  });

  // Pool discovery can fall back to RPC while the subgraph may still be able
  // to answer swap/volume queries. Try that independently so volume does not
  // stay N/A just because DLMMPool discovery failed.
  await enrichVolumeFromSubgraph();
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
