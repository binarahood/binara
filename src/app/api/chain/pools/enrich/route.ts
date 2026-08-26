import { NextResponse } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID } from '@/lib/robinhoodSubgraph';
import { enrichPools } from '@/lib/poolEnrichment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const sourcePools = await getPools(500);
    const result = await enrichPools(sourcePools);
    return NextResponse.json({
      status: 'live',
      chainId: ROBINHOOD_CHAIN_ID,
      pools: result.pools,
      dataQuality: result.dataQuality,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown enrichment error';
    return NextResponse.json({ error: 'Unable to enrich Robinhood Chain pool data.', detail: message, status: 'error', pools: [] }, { status: 503 });
  }
}
