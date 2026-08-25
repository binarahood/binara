import { NextResponse } from 'next/server';
import { checkSubgraph, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL } from '@/lib/robinhoodSubgraph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await checkSubgraph();

    return NextResponse.json({
      status: 'connected',
      chainId: ROBINHOOD_CHAIN_ID,
      blockNumber: null,
      source: 'subgraph',
      subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL,
      poolsAvailable: result.pools,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown subgraph error';
    return NextResponse.json(
      { status: 'error', error: message, source: 'subgraph', timestamp: Date.now() },
      { status: 503 },
    );
  }
}
