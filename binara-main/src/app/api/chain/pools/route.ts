'use server';

import { NextResponse } from 'next/server';
import { runIndexer, syncPools } from '@/lib/indexer/dlmmIndexer';
import { indexerStore, IndexedPool } from '@/lib/indexer/store';
import { resolveTokenPair } from '@/lib/tokenMetadata';

const CHAIN_ID = 4663;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

let indexerStarted = false;

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

async function ensureIndexerRunning() {
  if (indexerStarted) return;
  indexerStarted = true;
  runIndexer().catch(() => {
    indexerStarted = false;
  }).finally(() => {
    indexerStarted = false;
  });
}

function knownSymbol(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower === WETH_ADDRESS.toLowerCase()) return 'WETH';
  if (lower === USDG_ADDRESS.toLowerCase()) return 'USDG';
  return null;
}

function cleanIndexedSymbol(value: string | null | undefined): string | null {
  const symbol = String(value || '').trim();
  if (!symbol || symbol === 'UNKNOWN' || symbol === '???') return null;
  if (symbol.includes('…') || symbol.includes('...') || /^0x/i.test(symbol)) return null;
  return symbol;
}

async function formatPoolForAPI(pool: IndexedPool) {
  const resolved = await resolveTokenPair(
    pool.tokenA,
    pool.tokenB,
    pool.symbolA,
    pool.symbolB,
    pool.decimalsA,
    pool.decimalsB,
  );

  const tokenASymbol = knownSymbol(pool.tokenA) || cleanIndexedSymbol(pool.symbolA) || resolved.tokenA.symbol;
  const tokenBSymbol = knownSymbol(pool.tokenB) || cleanIndexedSymbol(pool.symbolB) || resolved.tokenB.symbol;

  return {
    id: pool.address,
    address: pool.address,
    pair: `${tokenASymbol}/${tokenBSymbol}`,
    tokenA: tokenASymbol,
    tokenB: tokenBSymbol,
    tokenAAddress: pool.tokenA,
    tokenBAddress: pool.tokenB,
    decimalsA: resolved.tokenA.decimals,
    decimalsB: resolved.tokenB.decimals,
    protocol: pool.protocol,
    currentPrice: pool.currentPrice,
    priceChange24h: pool.priceChange24h,
    binStep: pool.binStep,
    activeBin: pool.activeBin,
    fee: pool.fee,
    tvl: pool.tvl,
    reserveX: pool.reserveX,
    reserveY: pool.reserveY,
    volume1h: pool.volumeUSD1h,
    volume6h: pool.volumeUSD6h,
    volume24h: pool.volumeUSD24h,
    volumeRaw24h: pool.volume24h,
    volumeToTVL: pool.volumeToTVL,
    volatility: pool.volatility,
    analyticsScore: pool.analyticsScore,
    riskLevel: pool.riskLevel,
    estimatedAPR: pool.estimatedAPR,
    timeInRange: pool.timeInRange,
    swapCount24h: pool.swapCount24h,
    swapCount1h: pool.swapCount1h,
    status: pool.status,
    createdBlock: pool.createdBlock,
    createdAt: pool.createdTimestamp ? new Date(pool.createdTimestamp * 1000).toISOString() : null,
    updatedAt: new Date(pool.updatedAt).toISOString(),
  };
}

export async function GET() {
  try {
    const [blockHex, chainHex] = await Promise.all([
      rpcCall('eth_blockNumber'),
      rpcCall('eth_chainId'),
    ]);
    const blockNumber = parseInt(blockHex, 16);
    const chainId = parseInt(chainHex, 16);

    if (chainId !== CHAIN_ID) {
      return NextResponse.json({ error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}` }, { status: 502 });
    }

    let indexerState = indexerStore.getState();
    let rawPools = indexerStore.getAllPools();

    if (rawPools.length === 0 && indexerState.status !== 'indexing') {
      try {
        await syncPools();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Pool discovery failed';
        indexerStore.setState({ status: 'error', error: message });
      }
      indexerState = indexerStore.getState();
      rawPools = indexerStore.getAllPools();
    } else if (rawPools.length > 0) {
      void ensureIndexerRunning();
    }

    const pools = await Promise.all(rawPools.map(formatPoolForAPI));
    const dataStatus: 'live' | 'indexing' | 'error' = indexerState.status === 'error'
      ? 'error'
      : pools.length === 0 || indexerState.status === 'indexing'
        ? 'indexing'
        : 'live';

    return NextResponse.json({
      status: dataStatus,
      chainId,
      blockNumber,
      pools,
      indexer: {
        status: indexerState.status,
        lastIndexedBlock: indexerState.lastIndexedBlock,
        lastIndexedTimestamp: indexerState.lastIndexedTimestamp,
        poolsDiscovered: indexerState.poolsDiscovered,
        swapsIndexed: indexerState.swapsIndexed,
        protocol: indexerState.protocol,
        factoryAddress: indexerState.factoryAddress,
        subgraphEndpoint: indexerState.subgraphEndpoint,
        error: indexerState.error,
      },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown RPC error';
    return NextResponse.json(
      { error: 'Unable to retrieve live Robinhood Chain data.', detail: message, status: 'error', pools: [] },
      { status: 503 },
    );
  }
}
