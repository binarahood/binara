import { NextResponse } from 'next/server';

const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const CHAIN_ID = 4663;

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const body = await res.json();
  return { httpStatus: res.status, body };
}

export async function GET() {
  const query = `
    query Health($chainId: Int!) {
      pools: DLMMPool(
        where: { chainId: { _eq: $chainId } }
        limit: 1
      ) { id tokenX { id symbol decimals } tokenY { id symbol decimals } }
      swaps: DLMMSwap(
        where: { chainId: { _eq: $chainId } }
        limit: 5
        order_by: { timestamp: desc }
      ) {
        id
        pool
        transaction
        timestamp
        blockNumber
        tokenIn
        tokenOut
        amountIn
        amountOut
        amountUSD
        activeBinId
      }
    }
  `;

  try {
    const result = await subgraphQuery(query, { chainId: CHAIN_ID });
    const errors = Array.isArray(result.body?.errors) ? result.body.errors : [];
    const data = result.body?.data ?? null;

    return NextResponse.json({
      ok: result.httpStatus >= 200 && result.httpStatus < 300 && errors.length === 0,
      httpStatus: result.httpStatus,
      poolCountSample: data?.pools?.length ?? 0,
      swapCountSample: data?.swaps?.length ?? 0,
      latestSwap: data?.swaps?.[0] ?? null,
      errors: errors.map((e: { message?: string; path?: unknown }) => ({ message: e.message, path: e.path })),
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown subgraph health error',
      timestamp: Date.now(),
    }, { status: 503 });
  }
}
