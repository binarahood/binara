'use server';

import { NextRequest, NextResponse } from 'next/server';

const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

async function rpcCall(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

// ERC-20 balanceOf selector: 0x70a08231
function encodeBalanceOf(address: string): string {
  const padded = address.replace('0x', '').padStart(64, '0');
  return '0x70a08231' + padded;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    // Get ETH balance
    const balanceHex = await rpcCall('eth_getBalance', [address, 'latest']);
    const ethBalance = (parseInt(balanceHex, 16) / 1e18).toFixed(6);

    // Get current block
    const blockHex = await rpcCall('eth_blockNumber');
    const blockNumber = parseInt(blockHex, 16);

    // LP positions require indexer/subgraph — return empty with clear message
    // When a subgraph is available for Robinhood Chain LP positions, integrate here
    return NextResponse.json({
      address,
      ethBalance,
      blockNumber,
      tokenBalances: [],
      lpPositions: [],
      message: 'ETH balance loaded from chain. LP position indexer integration required for position discovery.',
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Unable to retrieve wallet data from Robinhood Chain.', detail: message },
      { status: 503 }
    );
  }
}
