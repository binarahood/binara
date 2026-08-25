import { NextResponse } from 'next/server';
import { getPools, ROBINHOOD_CHAIN_ID, ROBINHOOD_SUBGRAPH_URL, toLivePool } from '@/lib/robinhoodSubgraph';
import { fetchGeckoPoolMarketData } from '@/lib/geckoTerminal';
import { fetchGmgnTokenData } from '@/lib/gmgn';
import { getOpportunityScore } from '@/lib/opportunityScore';
import { fetchTokenMetadata, resolveTokenLabel, resolveTokenName } from '@/lib/tokenMetadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_GMGN_TOKENS = 80;

function poolAddress(id: string): string { const separator = id.indexOf(':'); return (separator >= 0 ? id.slice(separator + 1) : id).toLowerCase(); }
function tokenAddress(value: string | null | undefined): string { return String(value || '').trim().toLowerCase(); }
function gmgnPoolMatches(gmgnPool: string | null, pool: string): boolean { return Boolean(gmgnPool && gmgnPool.toLowerCase() === pool.toLowerCase()); }

export async function GET() {
  try {
    const sourcePools = await getPools(500);
    const poolAddresses = sourcePools.map((pool) => poolAddress(pool.id));
    const tokenAddresses = Array.from(new Set(sourcePools.flatMap((pool) => [tokenAddress(pool.tokenX), tokenAddress(pool.tokenY)]).filter(Boolean)));

    const market = await fetchGeckoPoolMarketData(poolAddresses);
    const missingPoolAddresses = new Set(poolAddresses.filter((address) => {
      const item = market.byPool.get(address);
      return !item || item.baseTokenPriceUsd === null || item.reserveUsd === null || item.volume24h === null;
    }));
    const priorityTokens = sourcePools.flatMap((pool) => {
      const address = poolAddress(pool.id);
      return missingPoolAddresses.has(address) ? [tokenAddress(pool.tokenX), tokenAddress(pool.tokenY)] : [];
    });
    const gmgnAddresses = Array.from(new Set([...priorityTokens, ...tokenAddresses])).filter(Boolean).slice(0, MAX_GMGN_TOKENS);

    const [gmgn, tokenMetadata] = await Promise.all([
      fetchGmgnTokenData(gmgnAddresses),
      fetchTokenMetadata(tokenAddresses),
    ]);

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
      const gmgnPoolA = gmgnPoolMatches(gmgnA?.biggestPoolAddress ?? null, address) ? gmgnA : null;
      const gmgnPoolB = gmgnPoolMatches(gmgnB?.biggestPoolAddress ?? null, address) ? gmgnB : null;
      const poolMatchedGmgn = gmgnPoolA || gmgnPoolB;

      const tvl = marketData?.reserveUsd ?? base.tvl ?? poolMatchedGmgn?.liquidityUsd ?? null;
      const volume24h = marketData?.volume24h ?? poolMatchedGmgn?.volume24h ?? null;
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
        swapCount1h: marketData?.swapCount1h ?? poolMatchedGmgn?.swaps24h ?? null,
        swapCount24h: marketData?.swapCount24h ?? poolMatchedGmgn?.swaps24h ?? null,
        gmgn: gmgnData,
      };
      return { ...pool, analyticsScore: getOpportunityScore(pool) };
    });

    return NextResponse.json({
      status: 'live',
      chainId: ROBINHOOD_CHAIN_ID,
      blockNumber: null,
      pools,
      dataQuality: {
        poolSource: 'Robinhood Chain DLMM subgraph',
        marketSource: 'GeckoTerminal pool multi endpoint with exact-pool GMGN fallback',
        volumeSource: 'GeckoTerminal pool data; GMGN only when its largest identified pool matches the requested pool',
        tokenSource: 'Robinhood asset registry + Blockscout + GMGN + DLMM subgraph fallback',
        gmgnEnabled: gmgn.configured,
        gmgnTokensAttempted: gmgn.tokensAttempted,
        gmgnTokensReturned: gmgn.tokensReturned,
        gmgnCoveragePct: gmgn.tokensAttempted > 0 ? Number(((gmgn.tokensReturned / gmgn.tokensAttempted) * 100).toFixed(1)) : 0,
        gmgnTokenBudget: MAX_GMGN_TOKENS,
        verifiedTokenMetadataCount: tokenMetadata.size,
        volumeWindowSeconds: 86_400,
        volumeComplete: market.complete,
        poolsDiscovered: sourcePools.length,
        poolsWithMarketData: market.poolsReturned,
        poolsMissingPrimaryMarketData: missingPoolAddresses.size,
        geckoBatchesSucceeded: market.batchesSucceeded,
        geckoBatchesAttempted: market.batchesAttempted,
        note: 'Price, liquidity, volume and swaps prefer verified pool-level GeckoTerminal data. GMGN token data is used for targeted enrichment and only exact-pool liquidity/volume/swap fallback. 24h volatility is displayed as absolute 24h price movement, not fabricated statistical volatility. APR is a simple 24h fee run-rate estimate.'
      },
      indexer: { status: 'live', lastIndexedBlock: 0, lastIndexedTimestamp: Date.now(), poolsDiscovered: pools.length, swapsIndexed: null, protocol: 'Robinhood DLMM', factoryAddress: null, subgraphEndpoint: ROBINHOOD_SUBGRAPH_URL, error: null },
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json({ error: 'Unable to retrieve Robinhood Chain live market data.', detail: message, status: 'error', pools: [] }, { status: 503 });
  }
}
