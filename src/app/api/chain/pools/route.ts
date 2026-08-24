'use server';

import { NextResponse } from 'next/server';
import { runIndexer, syncPools } from '@/lib/indexer/dlmmIndexer';
import { indexerStore, IndexedPool } from '@/lib/indexer/store';

const CHAIN_ID = 4663;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

// Track whether a background refresh is already running in this warm process.
let indexerStarted = false;

async function ensureIndexerRunning() {
  if (indexerStarted) return;
  indexerStarted = true;
  runIndexer().catch(() => {
    indexerStarted = false;
  }).finally(() => {
    indexerStarted = false;
  });
}

/**
 * Converts an IndexedPool to the API response format.
 * Returns N/A strings for unavailable USD values.
 */
function formatPoolForAPI(pool: IndexedPool) {
  return {
    id: pool.address,
    address: pool.address,
    pair: pool.pair,
    tokenA: pool.symbolA,
    tokenB: pool.symbolB,
    tokenAAddress: pool.tokenA,
    tokenBAddress: pool.tokenB,
    decimalsA: pool.decimalsA,
    decimalsB: pool.decimalsB,
    protocol: pool.protocol,

    // Price
    currentPrice: pool.currentPrice,
    priceChange24h: pool.priceChange24h,

    // DLMM specifics
    binStep: pool.binStep,
    activeBin: pool.activeBin,
    fee: pool.fee,

    // Liquidity
    tvl: pool.tvl,
    reserveX: pool.reserveX,
    reserveY: pool.reserveY,

    // Volume — USD if available, null otherwise (UI shows N/A)
    volume1h: pool.volumeUSD1h,
    volume6h: pool.volumeUSD6h,
    volume24h: pool.volumeUSD24h,
    volumeRaw24h: pool.volume24h,

    // Derived
    volumeToTVL: pool.volumeToTVL,
    volatility: pool.volatility,
    analyticsScore: pool.analyticsScore,
    riskLevel: pool.riskLevel,
    estimatedAPR: pool.estimatedAPR,
    timeInRange: pool.timeInRange,

    // Activity
    swapCount24h: pool.swapCount24h,
    swapCount1h: pool.swapCount1h,
    status: pool.status,

    // Timestamps
    createdBlock: pool.createdBlock,
    createdAt: pool.createdTimestamp
      ? new Date(pool.createdTimestamp * 1000).toISOString()
      : null,
    updatedAt: new Date(pool.updatedAt).toISOString(),
  };
}

export async function GET() {
  try {
    // Verify chain connectivity
    const [blockHex, chainHex] = await Promise.all([
      rpcCall('eth_blockNumber'),
      rpcCall('eth_chainId'),
    ]);
    const blockNumber = parseInt(blockHex, 16);
    const chainId = parseInt(chainHex, 16);

    if (chainId !== CHAIN_ID) {
      return NextResponse.json(
        { error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}` },
        { status: 502 }
      );
    }

    let indexerState = indexerStore.getState();
    let rawPools = indexerStore.getAllPools();

    // On a fresh Vercel serverless instance the in-memory store is empty.
    // Do one synchronous discovery pass so the first request can actually
    // return real pools instead of returning an empty placeholder response.
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
      // Keep live RPC fields fresh on warm instances without blocking the response.
      void ensureIndexerRunning();
    }

    const pools = rawPools.map(formatPoolForAPI);

    // Determine data status
    let dataStatus: 'live' | 'indexing' | 'error';
    if (indexerState.status === 'error') {
      dataStatus = 'error';
    } else if (pools.length === 0 || indexerState.status === 'indexing') {
      dataStatus = 'indexing';
    } else {
      dataStatus = 'live';
    }

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
      {
        error: 'Unable to retrieve live Robinhood Chain data.',
        detail: message,
        status: 'error',
        pools: [],
      },
      { status: 503 }
    );
  }
}
