import { NextRequest } from 'next/server';
import { onNewBlock } from '@/lib/indexer/dlmmIndexer';
import { indexerStore } from '@/lib/indexer/store';

const WS_URL = process.env.ROBINHOOD_WS_URL || 'wss://feed.mainnet.chain.robinhood.com';
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const CHAIN_ID = 4663;

async function rpcCall(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  function sseMessage(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let wsInstance: WebSocket | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (wsInstance) {
          try { wsInstance.close(); } catch { /* ignore */ }
          wsInstance = null;
        }
      };

      req.signal.addEventListener('abort', cleanup);

      // Send initial chain status via RPC
      try {
        const [blockHex, chainHex] = await Promise.all([
          rpcCall('eth_blockNumber'),
          rpcCall('eth_chainId'),
        ]);
        const blockNumber = parseInt(blockHex as string, 16);
        const chainId = parseInt(chainHex as string, 16);

        if (chainId !== CHAIN_ID) {
          controller.enqueue(sseMessage('error', {
            error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}`,
          }));
          controller.close();
          return;
        }

        const indexerState = indexerStore.getState();

        controller.enqueue(sseMessage('status', {
          status: 'connected',
          chainId,
          blockNumber,
          indexerStatus: indexerState.status,
          poolsDiscovered: indexerState.poolsDiscovered,
          swapsIndexed: indexerState.swapsIndexed,
          timestamp: Date.now(),
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'RPC connection failed';
        controller.enqueue(sseMessage('error', { error: msg, timestamp: Date.now() }));
      }

      // WebSocket connection to Robinhood Chain feed
      const connectWS = () => {
        if (closed) return;

        try {
          wsInstance = new WebSocket(WS_URL);

          wsInstance.addEventListener('open', () => {
            if (closed) { wsInstance?.close(); return; }

            const subscribeMsg = JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_subscribe',
              params: ['newHeads'],
            });
            wsInstance?.send(subscribeMsg);

            controller.enqueue(sseMessage('ws_status', {
              connected: true,
              timestamp: Date.now(),
            }));
          });

          wsInstance.addEventListener('message', async (event: MessageEvent) => {
            if (closed) return;
            try {
              const raw = typeof event.data === 'string' ? event.data : event.data.toString();
              const msg = JSON.parse(raw);

              // New block notification
              if (msg.method === 'eth_subscription' && msg.params?.result) {
                const blockData = msg.params.result;
                const blockNumber = parseInt(blockData.number, 16);
                const blockTimestamp = parseInt(blockData.timestamp, 16);

                // Emit block event
                controller.enqueue(sseMessage('block', {
                  blockNumber,
                  blockTimestamp,
                  hash: blockData.hash,
                  timestamp: Date.now(),
                }));

                // Process block through indexer — get real pool updates
                try {
                  const { updatedPools, newSwaps } = await onNewBlock(blockNumber);

                  // Emit pool_update with indexer state
                  const indexerState = indexerStore.getState();
                  controller.enqueue(sseMessage('pool_update', {
                    blockNumber,
                    timestamp: Date.now(),
                    source: 'block',
                    updatedPools,
                    indexerStatus: indexerState.status,
                    poolsDiscovered: indexerState.poolsDiscovered,
                    swapsIndexed: indexerState.swapsIndexed,
                  }));

                  // Emit individual swap events for real swaps
                  for (const swap of newSwaps) {
                    const pool = indexerStore.getPool(swap.poolAddress);
                    if (!pool) continue;

                    controller.enqueue(sseMessage('swap', {
                      poolAddress: swap.poolAddress,
                      pair: pool.pair,
                      txHash: swap.txHash,
                      blockNumber: swap.blockNumber,
                      timestamp: swap.timestamp,
                      tokenIn: swap.tokenIn,
                      tokenOut: swap.tokenOut,
                      amountIn: swap.amountIn,
                      amountOut: swap.amountOut,
                      price: swap.price,
                      activeBin: swap.activeBinAfter,
                      volumeUSD: swap.volumeUSD,
                    }));

                    // Emit price update for the pool
                    if (pool.currentPrice !== null) {
                      controller.enqueue(sseMessage('price_update', {
                        poolAddress: swap.poolAddress,
                        pair: pool.pair,
                        price: pool.currentPrice,
                        activeBin: pool.activeBin,
                        timestamp: Date.now(),
                      }));
                    }
                  }

                  // Emit volume updates for pools that had swaps
                  const poolsWithSwaps = new Set(newSwaps.map((s) => s.poolAddress));
                  for (const poolAddr of poolsWithSwaps) {
                    const pool = indexerStore.getPool(poolAddr);
                    if (!pool) continue;
                    controller.enqueue(sseMessage('volume_update', {
                      poolAddress: poolAddr,
                      pair: pool.pair,
                      volume1h: pool.volumeUSD1h,
                      volume6h: pool.volumeUSD6h,
                      volume24h: pool.volumeUSD24h,
                      swapCount24h: pool.swapCount24h,
                      timestamp: Date.now(),
                    }));
                  }
                } catch {
                  // Block processing failed — still emit pool_update so client re-fetches
                  controller.enqueue(sseMessage('pool_update', {
                    blockNumber,
                    timestamp: Date.now(),
                    source: 'block',
                  }));
                }
              }

              // Subscription confirmation
              if (msg.id === 1 && msg.result) {
                controller.enqueue(sseMessage('subscribed', {
                  subscriptionId: msg.result,
                  timestamp: Date.now(),
                }));
              }
            } catch {
              // Malformed message — ignore
            }
          });

          wsInstance.addEventListener('error', (event: Event) => {
            if (closed) return;
            const errMsg = (event as ErrorEvent).message ?? 'WebSocket error';
            controller.enqueue(sseMessage('ws_status', {
              connected: false,
              error: errMsg,
              timestamp: Date.now(),
            }));
          });

          wsInstance.addEventListener('close', () => {
            if (closed) return;
            controller.enqueue(sseMessage('ws_status', {
              connected: false,
              timestamp: Date.now(),
            }));
            reconnectTimer = setTimeout(connectWS, 5000);
          });

        } catch (err) {
          if (closed) return;
          const msg = err instanceof Error ? err.message : 'WebSocket unavailable';
          controller.enqueue(sseMessage('ws_status', {
            connected: false,
            error: msg,
            timestamp: Date.now(),
          }));
          reconnectTimer = setTimeout(connectWS, 10_000);
        }
      };

      // Heartbeat to keep SSE connection alive
      heartbeatTimer = setInterval(() => {
        if (closed) {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          cleanup();
        }
      }, 20_000);

      connectWS();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
