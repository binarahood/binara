'use server';

import { NextResponse } from 'next/server';

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

export async function GET() {
  try {
    const [blockHex, chainHex] = await Promise.all([
      rpcCall('eth_blockNumber'),
      rpcCall('eth_chainId'),
    ]);

    const blockNumber = parseInt(blockHex, 16);
    const chainId = parseInt(chainHex, 16);

    return NextResponse.json({
      status: 'connected',
      chainId,
      blockNumber,
      rpcUrl: RPC_URL.replace(/\/\/.*@/, '//***@'), // mask credentials if any
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { status: 'error', error: message, timestamp: Date.now() },
      { status: 503 }
    );
  }
}
