import { NextResponse } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL, toLivePool } from '@/lib/robinhoodSubgraph';
import { fetchGeckoPoolMarketData } from '@/lib/geckoTerminal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function poolAddress(id: string): string {
  const separator = id.indexOf(':');
  return (separator >= 0 ? id.slice(separator + 1) : id).toLowerCase();
}

export async function GET() {
  try {
    const sourcePools = await getPools(500);
    const market = await fetchGeckoPoolMarketData(sourcePools.map((pool) => poolAddress(pool.id)));

    const pools = sourcePools.map((sourcePool) => {
      const base = toLivePool(sourcePool);
      const address = poolAddress(sourcePool.id);
      const marketData = market.byPool.get(address);
      const tvl = base.tvl;
      const volume24h = marketData?.volume24h ?? null;

      return {
        ...base,
        address,
        volume1h: marketData?.volume1h ?? null,
        volume6h: marketData?.volume6h ?? null,
        volume24h,
        volumeRaw24h: volume24h ?? 0,
        volumeToTVL: tvl !== null && tvl > 0 && volume24h !== null ? volume24h / tvl : 0,
        swapCount1h: marketData?.swapCount1h ?? null,
        swapCount24h: marketData?.swapCount24h ?? null,
      };
    });

    return NextResponse.json({
      status: 'live',
      chainId: ROBINHOOD_CHAIN_ID,
      blockNumber: null,
      pools,
      dataQuality: {
        poolSource: 'Robinhood Chain DLMM subgraph',
        volumeSource: 'GeckoTerminal pool market data',
        volumeWindowSeconds: 86_400,
        volumeComplete: market.complete,
        poolsDiscovered: sourcePools.length,
        poolsWithMarketData: market.poolsReturned,
        note: market.complete
          ? 'Verified volume and transaction metrics are available for every discovered pool.'
          : 'Some pools have no verified market response; missing metrics remain null rather than estimated.',
      },
      indexer: {
        status: 'live',
        lastIndexedBlock: 0,
        lastIndexedTimestamp: Date.now(),
        poolsDiscovered: pools.length,
        swapsIndexed: null,
        protocol: 'Robinhood DLMM',
        factoryAddress: null,
        subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL,
        error: null,
      },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json(
      {
        error: 'Unable to retrieve Robinhood Chain live market data.',
        detail: message,
        status: 'error',
        pools: [],
      },
      { status: 503 },
    );
  }
}
