/**
 * Compatibility shim for the old indexer API.
 *
 * The live application no longer depends on RPC/factory scanning here.
 * Pool discovery is handled directly by robinhoodSubgraph.ts. These small
 * functions remain only for older callers that still import the indexer module.
 */

import { getPools, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL, toLivePool } from '@/lib/robinhoodSubgraph';
import { indexerStore, IndexedPool, IndexedSwap } from './store';

export const CHAIN_ID = ROBINHOOD_CHAIN_ID;
export const FACTORY_ADDRESS = '';
export const SUBGRAPH_URL = ROBINHOOD_SUBGRAPH_URL;

export function priceFromBinId(binId: number, binStep: number, decimalsX = 18, decimalsY = 18): number {
  if (!Number.isFinite(binId) || !Number.isFinite(binStep)) return 0;
  const base = 1 + binStep / 10_000;
  const raw = Math.pow(base, binId - 8_388_608);
  const price = raw * 10 ** (decimalsX - decimalsY);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function estimateTvlFromUSDG(
  tokenX: string,
  tokenY: string,
  decimalsX: number,
  decimalsY: number,
  reserveX: string,
  reserveY: string,
  binPrice: number,
): { tvl: number | null; priceXInY: number; source: 'bin' | 'reserve-ratio' | 'stable-side-only' | 'none' } {
  const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'.toLowerCase();
  const xStable = tokenX.toLowerCase() === USDG;
  const yStable = tokenY.toLowerCase() === USDG;
  if (!xStable && !yStable) return { tvl: null, priceXInY: 0, source: 'none' };

  const raw = (value: string, decimals: number) => {
    try { return Number(BigInt(value || '0')) / 10 ** decimals; } catch { return 0; }
  };
  const x = raw(reserveX, decimalsX);
  const y = raw(reserveY, decimalsY);
  if (x <= 0 && y <= 0) return { tvl: null, priceXInY: 0, source: 'none' };

  let price = Number.isFinite(binPrice) && binPrice > 0 ? binPrice : 0;
  let source: 'bin' | 'reserve-ratio' | 'stable-side-only' | 'none' = price > 0 ? 'bin' : 'none';

  if (!price && x > 0 && y > 0) {
    price = yStable ? y / x : x / y;
    source = price > 0 ? 'reserve-ratio' : 'none';
  }

  if (yStable && !xStable) {
    return price > 0
      ? { tvl: x * price + y, priceXInY: price, source }
      : { tvl: y || null, priceXInY: 0, source: 'stable-side-only' };
  }
  if (xStable && !yStable) {
    return price > 0
      ? { tvl: x + y / price, priceXInY: price, source }
      : { tvl: x || null, priceXInY: 0, source: 'stable-side-only' };
  }
  return { tvl: null, priceXInY: 0, source: 'none' };
}

function toIndexedPool(source: ReturnType<typeof toLivePool>): IndexedPool {
  return {
    address: source.address,
    protocol: 'Ramses DLMM',
    pid: 0,
    tokenA: source.tokenAAddress,
    tokenB: source.tokenBAddress,
    symbolA: source.tokenA,
    symbolB: source.tokenB,
    decimalsA: source.decimalsA,
    decimalsB: source.decimalsB,
    pair: source.pair,
    binStep: source.binStep,
    activeBin: source.activeBin,
    currentPrice: source.currentPrice,
    fee: source.fee,
    reserveX: source.reserveX,
    reserveY: source.reserveY,
    tvl: source.tvl,
    volume1m: 0,
    volume5m: 0,
    volume15m: 0,
    volume1h: 0,
    volume6h: 0,
    volume24h: 0,
    volumeUSD1h: null,
    volumeUSD6h: null,
    volumeUSD24h: null,
    volumeToTVL: 0,
    volatility: 0,
    analyticsScore: source.analyticsScore,
    riskLevel: source.riskLevel,
    estimatedAPR: null,
    priceChange24h: null,
    timeInRange: null,
    swapCount24h: 0,
    swapCount1h: 0,
    status: source.status,
    createdBlock: source.createdBlock,
    createdTimestamp: source.createdAt ? Math.floor(Date.parse(source.createdAt) / 1000) : 0,
    updatedAt: Date.now(),
  };
}

export async function syncPools(): Promise<void> {
  const pools = await getPools(500);
  for (const pool of pools) {
    indexerStore.upsertPool(toIndexedPool(toLivePool(pool)));
  }
  indexerStore.setState({
    status: 'live',
    lastIndexedTimestamp: Date.now(),
    poolsDiscovered: indexerStore.getAllPools().length,
    error: null,
    protocol: 'Robinhood DLMM',
    subgraphEndpoint: SUBGRAPH_URL,
    factoryAddress: FACTORY_ADDRESS,
  });
}

export async function runIndexer(): Promise<void> {
  indexerStore.setState({ status: 'indexing', startedAt: Date.now(), error: null });
  try {
    await syncPools();
  } catch (error) {
    indexerStore.setState({
      status: 'error',
      error: error instanceof Error ? error.message : 'Subgraph error',
    });
    throw error;
  }
}

export async function onNewBlock(blockNumber: number): Promise<{ updatedPools: string[]; newSwaps: IndexedSwap[] }> {
  await syncPools();
  indexerStore.setState({ lastIndexedBlock: blockNumber, lastIndexedTimestamp: Date.now(), status: 'live' });
  return { updatedPools: indexerStore.getAllPools().map((pool) => pool.address), newSwaps: [] };
}
