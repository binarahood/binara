import { NextRequest } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID, toLivePool } from '@/lib/robinhoodSubgraph';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      };

      req.signal.addEventListener('abort', close);

      const refresh = async () => {
        try {
          const pools = (await getPools(500)).map(toLivePool);
          send('status', {
            status: 'connected',
            chainId: ROBINHOOD_CHAIN_ID,
            blockNumber: null,
            indexerStatus: 'live',
            poolsDiscovered: pools.length,
            swapsIndexed: 0,
            timestamp: Date.now(),
          });
          send('pool_update', {
            source: 'subgraph',
            updatedPools: pools.map((pool) => pool.address),
            timestamp: Date.now(),
          });
        } catch (err) {
          send('error', {
            error: err instanceof Error ? err.message : 'Subgraph unavailable',
            timestamp: Date.now(),
          });
        }
      };

      void refresh();
      timer = setInterval(() => void refresh(), 30_000);
      const heartbeat = setInterval(() => send('heartbeat', { timestamp: Date.now() }), 15_000);
      req.signal.addEventListener('abort', () => clearInterval(heartbeat), { once: true });
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
