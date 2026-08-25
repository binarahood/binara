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
      indexer: {
        status: 'live',
        lastIndexedBlock: 0,
        lastIndexedTimestamp: Date.now(),
        poolsDiscovered: pools.length,
        swapsIndexed: 0,
        protocol: 'Robinhood DLMM',
        factoryAddress: null,
        subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL,
        error: null,
      },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown subgraph error';
    return NextResponse.json(
      {
        error: 'Unable to retrieve Robinhood Chain pools.',
        detail: message,
        status: 'error',
        pools: [],
      },
      { status: 503 },
    );
  }
}
