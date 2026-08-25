import { NextResponse } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL, toLivePool } from '@/lib/robinhoodSubgraph';
import { fetchGeckoPoolMarketData } from '@/lib/geckoTerminal';
import { fetchGmgnTokenData } from '@/lib/gmgn';
import { getOpportunityScore } from '@/lib/opportunityScore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function poolAddress(id: string): string {
  const separator = id.indexOf(':');
  return (separator >= 0 ? id.slice(separator + 1) : id).toLowerCase();
}

function tokenAddress(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function tokenSymbol(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export async function GET() {
  try {
    const sourcePools = await getPools(500);
    const poolAddresses = sourcePools.map((pool) => poolAddress(pool.id));
    const tokenAddresses = Array.from(new Set(
      sourcePools.flatMap((pool) => [tokenAddress(pool.tokenX), tokenAddress(pool.tokenY)]).filter(Boolean),
    ));

    const [market, gmgn] = await Promise.all([
      fetchGeckoPoolMarketData(poolAddresses),
      fetchGmgnTokenData(tokenAddresses),
    ]);

    const pools = sourcePools.map((sourcePool) => {
      const base = toLivePool(sourcePool);
      const address = poolAddress(sourcePool.id);
      const marketData = market.byPool.get(address);
      const tokenX = tokenAddress(sourcePool.tokenX);
      const tokenY = tokenAddress(sourcePool.tokenY);
      const gmgnA = tokenX ? gmgn.byToken.get(tokenX) ?? null : null;
      const gmgnB = tokenY ? gmgn.byToken.get(tokenY) ?? null : null;

      const tokenA = tokenSymbol(gmgnA?.symbol, base.tokenA);
      const tokenB = tokenSymbol(gmgnB?.symbol, base.tokenB);
      const tvl = base.tvl ?? gmgnA?.liquidityUsd ?? gmgnB?.liquidityUsd ?? null;
      const volume24h = marketData?.volume24h ?? gmgnA?.volume24h ?? gmgnB?.volume24h ?? null;
      const volumeToTVL = tvl !== null && tvl > 0 && volume24h !== null ? volume24h / tvl : null;
      const gmgnData = gmgnA || gmgnB;

      const pool = {
        ...base,
        pair: `${tokenA}/${tokenB}`,
        tokenA,
        tokenB,
        address,
        tvl,
        currentPrice: gmgnA?.priceUsd ?? gmgnB?.priceUsd ?? base.currentPrice,
        volume1h: marketData?.volume1h ?? null,
        volume6h: marketData?.volume6h ?? null,
        volume24h,
        volumeRaw24h: volume24h ?? 0,
        volumeToTVL,
        swapCount1h: marketData?.swapCount1h ?? gmgnA?.swaps24h ?? gmgnB?.swaps24h ?? null,
        swapCount24h: marketData?.swapCount24h ?? gmgnA?.swaps24h ?? gmgnB?.swaps24h ?? null,
        gmgn: gmgnData,
      };

      return {
        ...pool,
        analyticsScore: getOpportunityScore(pool),
      };
    });

    return NextResponse.json({
      status: 'live',
      chainId: ROBINHOOD_CHAIN_ID,
      blockNumber: null,
      pools,
      dataQuality: {
        poolSource: 'Robinhood Chain DLMM subgraph',
        volumeSource: 'GeckoTerminal pool market data with GMGN token fallback',
        tokenSource: gmgn.configured ? 'GMGN token info + Robinhood DLMM subgraph' : 'Robinhood DLMM subgraph',
        gmgnEnabled: gmgn.configured,
        gmgnTokensReturned: gmgn.tokensReturned,
        volumeWindowSeconds: 86_400,
        volumeComplete: market.complete,
        poolsDiscovered: sourcePools.length,
        poolsWithMarketData: market.poolsReturned,
        note: gmgn.configured
          ? 'GMGN enriches token metadata, price, liquidity, holders, smart-money and risk fields. Existing pool TVL remains authoritative when verified.'
          : 'Set GMGN_API_KEY in Vercel to enable GMGN enrichment. Existing verified pool data remains the primary source.',
      },
      indexer: {
        status: 'live',
        lastIndexedBlock: 0,
        lastIndexedTimestamp: Date.now(),
        poolsDiscovered: pools.length,
        swapsIndexed: null,
        protocol: 'Robinhood DLMM',
        factoryAddress: null,
        subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL,
        error: null,
      },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json(
      { error: 'Unable to retrieve Robinhood Chain live market data.', detail: message, status: 'error', pools: [] },
      { status: 503 },
    );
  }
}
