'use server';

import { NextResponse } from 'next/server';

const CHAIN_ID = 4663;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const API_VERSION = '1.0-new-tokens';

async function rpcCall(method: string, params: unknown[] = []): Promise<string> {
  const res = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), cache: 'no-store' });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: string; error?: { message?: string } };
  if (data.error || !data.result) throw new Error(data.error?.message || 'RPC response missing result');
  return data.result;
}

async function subgraphQuery(query: string, variables: Record<string, unknown>) {
  const res = await fetch(SUBGRAPH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), cache: 'no-store' });
  const body = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (!res.ok || body.errors?.length) throw new Error(body.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Subgraph HTTP ${res.status}`);
  return body.data || {};
}

interface PoolRow {
  tokenX: { id: string; symbol: string | null; decimals: number | null };
  tokenY: { id: string; symbol: string | null; decimals: number | null };
  createdAtTimestamp: number;
  createdAtBlockNumber: number;
  id: string;
}

function clean(value: string | null, address: string) {
  const s = String(value || '').trim();
  return !s || s === 'UNKNOWN' || s === '???' || /^0x/i.test(s) ? address.slice(0, 8) : s;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const minutes = Math.min(Math.max(Number(url.searchParams.get('minutes') || 60), 1), 1440);
    const since = Math.floor(Date.now() / 1000) - minutes * 60;
    const [blockHex, chainHex] = await Promise.all([rpcCall('eth_blockNumber'), rpcCall('eth_chainId')]);
    const chainId = parseInt(chainHex, 16);
    const blockNumber = parseInt(blockHex, 16);
    if (chainId !== CHAIN_ID) return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}`, tokens: [] }, { status: 502 });

    const query = `query NewTokenCandidates($chainId: Int!, $since: Int!) {
      DLMMPool(where: { chainId: { _eq: $chainId }, createdAtTimestamp: { _gte: $since } }, order_by: { createdAtTimestamp: desc }, limit: 200) {
        id tokenX { id symbol decimals } tokenY { id symbol decimals } createdAtTimestamp createdAtBlockNumber
      }
    }`;
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, since });
    const rows = (data.DLMMPool as PoolRow[] | undefined) || [];
    const seen = new Map<string, { address: string; symbol: string; decimals: number | null; firstPool: string; createdAt: string | null; createdBlock: number }>();
    for (const p of rows) {
      for (const token of [p.tokenX, p.tokenY]) {
        const address = token.id.toLowerCase();
        if (!seen.has(address)) seen.set(address, { address: token.id, symbol: clean(token.symbol, token.id), decimals: token.decimals, firstPool: p.id, createdAt: p.createdAtTimestamp ? new Date(p.createdAtTimestamp * 1000).toISOString() : null, createdBlock: p.createdAtBlockNumber });
      }
    }

    return NextResponse.json({ apiVersion: API_VERSION, status: 'live', chainId, blockNumber, windowMinutes: minutes, since, count: seen.size, tokens: [...seen.values()], note: 'These are tokens newly observed through newly-created DLMM pools; this endpoint does not claim that the ERC-20 contracts themselves were deployed in this window.', source: 'Robinhood Chain RPC + Ramses DLMM subgraph', timestamp: Date.now() });
  } catch (err) {
    return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: 'Unable to retrieve new token candidates.', detail: err instanceof Error ? err.message : 'Unknown error', tokens: [] }, { status: 503 });
  }
}
