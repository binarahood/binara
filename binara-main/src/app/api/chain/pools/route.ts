'use server';

import { NextResponse } from 'next/server';
import { fetchGeckoPoolMarketData } from '@/lib/geckoTerminal';

const CHAIN_ID = 4663;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const API_VERSION = '1.5-live-volume';

async function rpcCall(method: string, params: unknown[] = []): Promise<string> {
  const res = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), cache: 'no-store' });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: string; error?: { message?: string } };
  if (data.error || !data.result) throw new Error(data.error?.message || 'RPC response missing result');
  return data.result;
}

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(SUBGRAPH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), cache: 'no-store' });
  const body = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (!res.ok || body.errors?.length) throw new Error(body.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Subgraph HTTP ${res.status}`);
  return body.data || {};
}

function poolAddress(id: string): string {
  const separator = id.indexOf(':');
  return (separator >= 0 ? id.slice(separator + 1) : id).toLowerCase();
}

function knownSymbol(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower === WETH_ADDRESS.toLowerCase()) return 'WETH';
  if (lower === USDG_ADDRESS.toLowerCase()) return 'USDG';
  return null;
}

function cleanSymbol(value: unknown): string | null {
  const symbol = String(value ?? '').trim();
  if (!symbol || symbol === 'UNKNOWN' || symbol === '???' || symbol.includes('…') || symbol.includes('...') || /^0x/i.test(symbol)) return null;
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

async function fetchPools(): Promise<PoolRow[]> {
  const query = `query GetPools($chainId: Int!, $limit: Int!, $offset: Int!) {
    DLMMPool(where: { chainId: { _eq: $chainId } }, limit: $limit, offset: $offset, order_by: { createdAtTimestamp: asc }) {
      id tokenX { id symbol decimals } tokenY { id symbol decimals } binStep activeId reserveX reserveY totalValueLockedUSD createdAtBlockNumber createdAtTimestamp isAlive
    }
  }`;
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

export async function GET() {
  try {
    const [blockHex, chainHex, poolRows] = await Promise.all([
      rpcCall('eth_blockNumber'),
      rpcCall('eth_chainId'),
      fetchPools(),
    ]);

    const blockNumber = parseInt(blockHex, 16);
    const chainId = parseInt(chainHex, 16);
    if (chainId !== CHAIN_ID) return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}`, pools: [] }, { status: 502 });

    // Subgraph pool IDs are namespaced as "4663:0x...". GeckoTerminal expects
    // the actual EVM address, so strip the chain namespace before querying.
    const market = await fetchGeckoPoolMarketData(poolRows.map((pool) => poolAddress(pool.id)));

    const pools = poolRows.map((pool) => {
      const address = poolAddress(pool.id);
      const tokenA = knownSymbol(pool.tokenX.id) || cleanSymbol(pool.tokenX.symbol);
      const tokenB = knownSymbol(pool.tokenY.id) || cleanSymbol(pool.tokenY.symbol);
      const marketData = market.byPool.get(address);
      const tvl = pool.totalValueLockedUSD === null ? null : Number(pool.totalValueLockedUSD);
      const volume24h = marketData?.volume24h ?? null;
      const volumeToTVL = tvl !== null && tvl > 0 && volume24h !== null ? volume24h / tvl : null;

      return {
        id: pool.id, address,
        pair: `${tokenA || pool.tokenX.id.slice(0, 8)}/${tokenB || pool.tokenY.id.slice(0, 8)}`,
        tokenA: tokenA || null, tokenB: tokenB || null,
        tokenAAddress: pool.tokenX.id, tokenBAddress: pool.tokenY.id,
        decimalsA: pool.tokenX.decimals, decimalsB: pool.tokenY.decimals,
        protocol: 'Ramses DLMM',
        currentPrice: null,
        priceChange24h: null,
        binStep: pool.binStep, activeBin: pool.activeId,
        fee: null,
        tvl, reserveX: pool.reserveX, reserveY: pool.reserveY,
        volume1h: marketData?.volume1h ?? null,
        volume6h: marketData?.volume6h ?? null,
        volume24h,
        volumeRaw24h: null,
        volumeToTVL,
        volatility: null, analyticsScore: null, riskLevel: null, estimatedAPR: null, timeInRange: null,
        swapCount24h: marketData?.swapCount24h ?? null,
        swapCount1h: marketData?.swapCount1h ?? null,
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
        poolSource: 'Robinhood Chain RPC + Ramses DLMM subgraph',
        volumeSource: 'GeckoTerminal pool market data',
        volumeWindowSeconds: 86_400,
        volumeComplete: market.complete,
        poolsDiscovered: poolRows.length,
        poolsWithMarketData: market.poolsReturned,
        note: market.complete
          ? 'Volume and swap-count metrics are read from verified pool market data for every discovered pool.'
          : 'Some pools have no verified market response yet; missing volume-derived fields remain null rather than estimated.',
      },
      indexer: {
        status: 'live', lastIndexedBlock: blockNumber, lastIndexedTimestamp: Date.now(), poolsDiscovered: pools.length,
        swapsIndexed: null, protocol: 'Ramses DLMM', factoryAddress: '0xdcD5F77697914E27f56FD263EF82923C8524AbAc', subgraphEndpoint: SUBGRAPH_URL, error: null,
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: 'Unable to retrieve live Robinhood Chain data.', detail: message, pools: [] }, { status: 503 });
  }
}
