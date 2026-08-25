import { NextResponse } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL, toLivePool } from '@/lib/robinhoodSubgraph';
import { fetchGeckoPoolMarketData } from '@/lib/geckoTerminal';
import { fetchGmgnTokenData } from '@/lib/gmgn';
import { getOpportunityScore } from '@/lib/opportunityScore';
import { fetchTokenMetadata, resolveTokenLabel, resolveTokenName } from '@/lib/tokenMetadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function poolAddress(id: string): string { const separator = id.indexOf(':'); return (separator >= 0 ? id.slice(separator + 1) : id).toLowerCase(); }
function tokenAddress(value: string | null | undefined): string { return String(value || '').trim().toLowerCase(); }

export async function GET() {
  try {
    const sourcePools = await getPools(500);
    const poolAddresses = sourcePools.map((pool) => poolAddress(pool.id));
    const tokenAddresses = Array.from(new Set(sourcePools.flatMap((pool) => [tokenAddress(pool.tokenX), tokenAddress(pool.tokenY)]).filter(Boolean)));
    const [market, gmgn, tokenMetadata] = await Promise.all([fetchGeckoPoolMarketData(poolAddresses), fetchGmgnTokenData(tokenAddresses), fetchTokenMetadata(tokenAddresses)]);

    const pools = sourcePools.map((sourcePool) => {
      const base = toLivePool(sourcePool);
      const address = poolAddress(sourcePool.id);
      const marketData = market.byPool.get(address);
      const tokenX = tokenAddress(sourcePool.tokenX);
      const tokenY = tokenAddress(sourcePool.tokenY);
      const gmgnA = tokenX ? gmgn.byToken.get(tokenX) ?? null : null;
      const gmgnB = tokenY ? gmgn.byToken.get(tokenY) ?? null : null;
      const tokenA = resolveTokenLabel(tokenX, tokenMetadata, base.tokenA, gmgnA?.symbol);
      const tokenB = resolveTokenLabel(tokenY, tokenMetadata, base.tokenB, gmgnB?.symbol);
      const tokenAName = resolveTokenName(tokenX, tokenMetadata);
      const tokenBName = resolveTokenName(tokenY, tokenMetadata);
      const tvl = marketData?.reserveUsd ?? base.tvl ?? gmgnA?.liquidityUsd ?? gmgnB?.liquidityUsd ?? null;
      const volume24h = marketData?.volume24h ?? gmgnA?.volume24h ?? gmgnB?.volume24h ?? null;
      const volumeToTVL = tvl !== null && tvl > 0 && volume24h !== null ? volume24h / tvl : null;
      const feePct = (Number(sourcePool.binStep) || 0) * 0.01;
      const estimatedAPR = tvl !== null && tvl > 0 && volume24h !== null ? (volume24h * (feePct / 100) / tvl) * 365 * 100 : null;
      const priceMove24h = marketData?.priceChange24h ?? base.priceChange24h;
      const priceMoveAbs = priceMove24h === null ? null : Math.abs(priceMove24h);
      const riskLevel = priceMoveAbs === null || tvl === null || volumeToTVL === null ? base.riskLevel : priceMoveAbs > 25 || tvl < 2_500 || volumeToTVL > 20 ? 'EXTREME' : priceMoveAbs > 12 || tvl < 10_000 || volumeToTVL > 10 ? 'HIGH' : priceMoveAbs > 6 || tvl < 50_000 || volumeToTVL > 3 ? 'MEDIUM' : 'LOW';
      const gmgnData = gmgnA || gmgnB;

      const pool = {
        ...base,
        pair: `${tokenA}/${tokenB}`,
        tokenA, tokenB, tokenAName, tokenBName, address, tvl,
        currentPrice: marketData?.baseTokenPriceUsd ?? gmgnA?.priceUsd ?? gmgnB?.priceUsd ?? base.currentPrice,
        priceChange24h: priceMove24h,
        volume1h: marketData?.volume1h ?? null,
        volume6h: marketData?.volume6h ?? null,
        volume24h,
        volumeRaw24h: volume24h ?? 0,
        volumeToTVL,
        volatility: priceMoveAbs,
        timeInRange: null,
        estimatedAPR,
        riskLevel,
        swapCount1h: marketData?.swapCount1h ?? gmgnA?.swaps24h ?? gmgnB?.swaps24h ?? null,
        swapCount24h: marketData?.swapCount24h ?? gmgnA?.swaps24h ?? gmgnB?.swaps24h ?? null,
        gmgn: gmgnData,
      };
      return { ...pool, analyticsScore: getOpportunityScore(pool) };
    });

    return NextResponse.json({ status: 'live', chainId: ROBINHOOD_CHAIN_ID, blockNumber: null, pools,
      dataQuality: {
        poolSource: 'Robinhood Chain DLMM subgraph', marketSource: 'GeckoTerminal pool API', volumeSource: 'GeckoTerminal pool market data with GMGN token fallback', tokenSource: 'Robinhood asset registry + Blockscout + GMGN + DLMM subgraph fallback',
        gmgnEnabled: gmgn.configured, gmgnTokensAttempted: gmgn.tokensAttempted, gmgnTokensReturned: gmgn.tokensReturned,
        gmgnCoveragePct: gmgn.tokensAttempted > 0 ? Number(((gmgn.tokensReturned / gmgn.tokensAttempted) * 100).toFixed(1)) : 0,
        verifiedTokenMetadataCount: tokenMetadata.size, volumeWindowSeconds: 86_400, volumeComplete: market.complete,
        poolsDiscovered: sourcePools.length, poolsWithMarketData: market.poolsReturned,
        note: 'Price, liquidity, volume and swaps come from GeckoTerminal pool data. 24h volatility is displayed as absolute 24h price movement, avoiding a fabricated volatility model. APR is a simple 24h fee run-rate estimate.'
      },
      indexer: { status: 'live', lastIndexedBlock: 0, lastIndexedTimestamp: Date.now(), poolsDiscovered: pools.length, swapsIndexed: null, protocol: 'Robinhood DLMM', factoryAddress: null, subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL, error: null },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json({ error: 'Unable to retrieve Robinhood Chain live market data.', detail: message, status: 'error', pools: [] }, { status: 503 });
  }
}
