import { NextResponse } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL, toLivePool } from '@/lib/robinhoodSubgraph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const sourcePools = await getPools(500);
    const pools = sourcePools.map(toLivePool);
    return NextResponse.json({
      status: 'live',
      chainId: ROBINHOOD_CHAIN_ID,
      blockNumber: null,
      pools,
      dataQuality: {
        poolSource: 'Robinhood Chain DLMM subgraph',
        enrichment: 'async',
        poolsDiscovered: pools.length,
        note: 'Pool discovery is returned immediately. External market, token metadata, price, and GMGN enrichment is loaded asynchronously by the client so slow third-party APIs cannot block initial pool visibility.'
      },
      indexer: { status: 'live', lastIndexedBlock: 0, lastIndexedTimestamp: Date.now(), poolsDiscovered: pools.length, swapsIndexed: null, protocol: 'Robinhood DLMM', factoryAddress: null, subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL, error: null },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json({ error: 'Unable to retrieve Robinhood Chain live pool data.', detail: message, status: 'error', pools: [] }, { status: 503 });
  }
}
