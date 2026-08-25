'use server';

import { NextResponse } from 'next/server';

const CHAIN_ID = 4663;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const API_VERSION = '1.2-live-only';
const SWAP_QUERY_LIMIT = 5000;

async function rpcCall(method: string, params: unknown[] = []): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: string; error?: { message?: string } };
  if (data.error || !data.result) throw new Error(data.error?.message || 'RPC response missing result');
  return data.result;
}

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const body = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (!res.ok || body.errors?.length) {
    throw new Error(body.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Subgraph HTTP ${res.status}`);
  }
  return body.data || {};
}

function priceFromBinId(binId: number | null, binStep: number): number | null {
  if (binId === null || !Number.isFinite(binId) || !Number.isFinite(binStep)) return null;
  const base = 1 + binStep / 10_000;
  return Math.pow(base, binId - 8_388_608);
}

function knownSymbol(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower === WETH_ADDRESS.toLowerCase()) return 'WETH';
  if (lower === USDG_ADDRESS.toLowerCase()) return 'USDG';
  return null;
}

function cleanSymbol(value: unknown): string | null {
  const symbol = String(value ?? '').trim();
  if (!symbol || symbol === 'UNKNOWN' || symbol === '???') return null;
  if (symbol.includes('…') || symbol.includes('...') || /^0x/i.test(symbol)) return null;
  return symbol;
}

interface PoolRow {
  id: string;
  tokenX: { id: string; symbol: string | null; decimals: number | null };
  tokenY: { id: string; symbol: string | null; decimals: number | null };
  binStep: number;
  activeId: number | null;
  reserveX: string;
  reserveY: string;
  totalValueLockedUSD: string | null;
  createdAtBlockNumber: number;
  createdAtTimestamp: number;
  isAlive: boolean;
}

interface SwapRow {
  id: string;
  pool: string;
  transaction: string;
  timestamp: number;
  blockNumber: number;
  amountUSD: string | null;
}

interface VolumeResult {
  byPool: Map<string, { volume1h: number; volume6h: number; volume24h: number; swapCount1h: number; swapCount24h: number }>;
  complete: boolean;
  swapsScanned: number;
}

async function fetchPools(): Promise<PoolRow[]> {
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
        createdAtBlockNumber
        createdAtTimestamp
        isAlive
      }
    }
  `;

  const all: PoolRow[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, limit, offset });
    const rows = (data.DLMMPool as PoolRow[] | undefined) || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

async function fetchRecentSwaps(): Promise<VolumeResult> {
  const since = Math.floor(Date.now() / 1000) - 86_400;
  const query = `
    query GetRecentSwaps($chainId: Int!, $since: String!, $limit: Int!) {
      DLMMSwap(
        where: { chainId: { _eq: $chainId }, timestamp: { _gte: $since } }
        limit: $limit
        order_by: { timestamp: desc }
      ) {
        id
        pool
        transaction
        timestamp
        blockNumber
        amountUSD
      }
    }
  `;

  try {
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, since: String(since), limit: SWAP_QUERY_LIMIT });
    const swaps = (data.DLMMSwap as SwapRow[] | undefined) || [];
    const complete = swaps.length < SWAP_QUERY_LIMIT;
    const byPool = new Map<string, { volume1h: number; volume6h: number; volume24h: number; swapCount1h: number; swapCount24h: number }>();
    const now = Math.floor(Date.now() / 1000);

    for (const swap of swaps) {
      const pool = swap.pool.toLowerCase();
      let agg = byPool.get(pool);
      if (!agg) {
        agg = { volume1h: 0, volume6h: 0, volume24h: 0, swapCount1h: 0, swapCount24h: 0 };
        byPool.set(pool, agg);
      }
      const age = now - Number(swap.timestamp);
      if (age <= 86_400) agg.swapCount24h += 1;
      if (age <= 21_600) agg.volume6h += Number(swap.amountUSD || 0);
      if (age <= 3_600) agg.volume1h += Number(swap.amountUSD || 0);
      agg.volume24h += Number(swap.amountUSD || 0);
      if (age <= 3_600) agg.swapCount1h += 1;
    }

    return { byPool, complete, swapsScanned: swaps.length };
  } catch {
    return { byPool: new Map(), complete: false, swapsScanned: 0 };
  }
}

function analyticsFromLiveData(tvl: number | null, volume24h: number | null, swapCount24h: number | null): {
  volumeToTVL: number | null;
  estimatedAPR: number | null;
  analyticsScore: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
} {
  if (tvl === null || volume24h === null || swapCount24h === null) {
    return { volumeToTVL: null, estimatedAPR: null, analyticsScore: null, riskLevel: null };
  }
  const volumeToTVL = tvl > 0 ? volume24h / tvl : null;
  const estimatedAPR = tvl > 0 ? volume24h * 0.0005 * 365 / tvl * 100 : null;
  let score = 50;
  if (volumeToTVL !== null) {
    if (volumeToTVL > 5) score += 20;
    else if (volumeToTVL > 2) score += 10;
  }
  if (tvl > 100_000) score += 15;
  else if (tvl > 10_000) score += 8;
  if (swapCount24h > 100) score += 10;
  else if (swapCount24h > 10) score += 5;
  return {
    volumeToTVL,
    estimatedAPR,
    analyticsScore: Math.min(100, score),
    riskLevel: volumeToTVL !== null && volumeToTVL > 5 ? 'LOW' : volumeToTVL !== null && volumeToTVL > 1 ? 'MEDIUM' : 'HIGH',
  };
}

export async function GET() {
  try {
    const [blockHex, chainHex, poolRows, volume] = await Promise.all([
      rpcCall('eth_blockNumber'),
      rpcCall('eth_chainId'),
      fetchPools(),
      fetchRecentSwaps(),
    ]);

    const blockNumber = parseInt(blockHex, 16);
    const chainId = parseInt(chainHex, 16);
    if (chainId !== CHAIN_ID) {
      return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}`, pools: [] }, { status: 502 });
    }

    const pools = poolRows.map((pool) => {
      const tokenA = knownSymbol(pool.tokenX.id) || cleanSymbol(pool.tokenX.symbol);
      const tokenB = knownSymbol(pool.tokenY.id) || cleanSymbol(pool.tokenY.symbol);
      const agg = volume.complete ? volume.byPool.get(pool.id.toLowerCase()) : undefined;
      const tvl = pool.totalValueLockedUSD === null ? null : Number(pool.totalValueLockedUSD);
      const volume24h = agg ? agg.volume24h : null;
      const analytics = analyticsFromLiveData(tvl, volume24h, agg ? agg.swapCount24h : null);

      return {
        id: pool.id,
        address: pool.id,
        pair: `${tokenA || pool.tokenX.id.slice(0, 8)}/${tokenB || pool.tokenY.id.slice(0, 8)}`,
        tokenA: tokenA || null,
        tokenB: tokenB || null,
        tokenAAddress: pool.tokenX.id,
        tokenBAddress: pool.tokenY.id,
        decimalsA: pool.tokenX.decimals,
        decimalsB: pool.tokenY.decimals,
        protocol: 'Ramses DLMM',
        currentPrice: priceFromBinId(pool.activeId, pool.binStep),
        priceChange24h: null,
        binStep: pool.binStep,
        activeBin: pool.activeId,
        fee: pool.binStep * 0.01,
        tvl,
        reserveX: pool.reserveX,
        reserveY: pool.reserveY,
        volume1h: agg ? agg.volume1h : null,
        volume6h: agg ? agg.volume6h : null,
        volume24h,
        volumeRaw24h: null,
        volumeToTVL: analytics.volumeToTVL,
        volatility: null,
        analyticsScore: analytics.analyticsScore,
        riskLevel: analytics.riskLevel,
        estimatedAPR: analytics.estimatedAPR,
        timeInRange: null,
        swapCount24h: agg ? agg.swapCount24h : null,
        swapCount1h: agg ? agg.swapCount1h : null,
        status: pool.isAlive ? 'active' : 'inactive',
        createdBlock: pool.createdAtBlockNumber,
        createdAt: pool.createdAtTimestamp ? new Date(pool.createdAtTimestamp * 1000).toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      apiVersion: API_VERSION,
      status: 'live',
      chainId,
      blockNumber,
      pools,
      dataQuality: {
        source: 'Robinhood Chain RPC + Ramses DLMM subgraph',
        volumeWindowSeconds: 86_400,
        volumeComplete: volume.complete,
        swapsScanned: volume.swapsScanned,
        note: volume.complete
          ? 'Volume metrics are calculated from indexed swap events in the last 24 hours.'
          : '24h swap result exceeded the scan cap or the subgraph query failed; volume-derived fields are intentionally null rather than estimated.',
      },
      indexer: {
        status: 'live',
        lastIndexedBlock: blockNumber,
        lastIndexedTimestamp: Date.now(),
        poolsDiscovered: pools.length,
        swapsIndexed: volume.swapsScanned,
        protocol: 'Ramses DLMM',
        factoryAddress: '0xdcD5F77697914E27f56FD263EF82923C8524AbAc',
        subgraphEndpoint: SUBGRAPH_URL,
        error: null,
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json({
      apiVersion: API_VERSION,
      status: 'error',
      error: 'Unable to retrieve live Robinhood Chain data.',
      detail: message,
      pools: [],
    }, { status: 503 });
  }
}
