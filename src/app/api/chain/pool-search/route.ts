import { NextResponse } from 'next/server';
import { getPools, toLivePool } from '@/lib/robinhoodSubgraph';
import { fetchGeckoPoolMarketData, searchGeckoPools } from '@/lib/geckoTerminal';
import { fetchTokenMetadata, resolveTokenLabel, resolveTokenName } from '@/lib/tokenMetadata';
import { fetchGmgnTokenData } from '@/lib/gmgn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_RESULTS = 20;
const MAX_INDEXED_POOLS = 500;

function normalize(value: unknown): string { return String(value || '').trim().toLowerCase(); }
function matches(query: string, pool: { address: string; tokenA: string; tokenB: string; tokenAName?: string | null; tokenBName?: string | null; pair?: string }): boolean {
  const q = normalize(query);
  return [pool.address, pool.tokenA, pool.tokenB, pool.tokenAName, pool.tokenBName, pool.pair].some((value) => normalize(value).includes(q));
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 2) return NextResponse.json({ status: 'ok', query, results: [], discovery: { source: 'none', searched: false } });

  try {
    const indexed = await getPools(MAX_INDEXED_POOLS);
    const addresses = indexed.map((pool) => String(pool.id).includes(':') ? String(pool.id).split(':').pop() || '' : String(pool.id)).map(normalize).filter(Boolean);
    const metadata = await fetchTokenMetadata(Array.from(new Set(indexed.flatMap((pool) => [normalize(pool.tokenX), normalize(pool.tokenY)]).filter(Boolean))));
    const indexedResults = indexed.map((pool) => {
      const live = toLivePool(pool);
      const tokenA = resolveTokenLabel(normalize(pool.tokenX), metadata, live.tokenA, null);
      const tokenB = resolveTokenLabel(normalize(pool.tokenY), metadata, live.tokenB, null);
      return { ...live, tokenA, tokenB, tokenAName: resolveTokenName(normalize(pool.tokenX), metadata), tokenBName: resolveTokenName(normalize(pool.tokenY), metadata) };
    }).filter((pool) => matches(query, pool));

    const geckoResults = await searchGeckoPools(query);
    const combinedAddresses = Array.from(new Set([...addresses, ...geckoResults.map((pool) => pool.address).filter(Boolean)]));
    const market = combinedAddresses.length ? await fetchGeckoPoolMarketData(combinedAddresses) : { byPool: new Map(), complete: true, poolsReturned: 0, batchesSucceeded: 0, batchesAttempted: 0 };
    const tokenAddresses = Array.from(new Set(geckoResults.flatMap((pool) => [pool.baseTokenAddress, pool.quoteTokenAddress]).filter(Boolean) as string[]));
    const [gmgn, geckoMetadata] = await Promise.all([fetchGmgnTokenData(tokenAddresses.slice(0, 40)), fetchTokenMetadata(tokenAddresses)]);

    const resultMap = new Map<string, Record<string, unknown>>();
    for (const pool of indexedResults) {
      const address = normalize(pool.address);
      const marketData = market.byPool.get(address);
      const tvl = marketData?.reserveUsd ?? pool.tvl ?? null;
      resultMap.set(address, { ...pool, address, tvl, currentPrice: marketData?.baseTokenPriceUsd ?? pool.currentPrice, volume24h: marketData?.volume24h ?? pool.volume24h, volumeToTVL: tvl && tvl > 0 && marketData?.volume24h != null ? marketData.volume24h / tvl : null, discoverySource: 'robinhood-index+gecko' });
    }
    for (const pool of geckoResults) {
      const address = normalize(pool.address);
      const marketData = market.byPool.get(address);
      const tokenA = pool.baseTokenAddress ? resolveTokenLabel(pool.baseTokenAddress, geckoMetadata, pool.baseTokenSymbol || 'UNKNOWN', gmgn.byToken.get(pool.baseTokenAddress)?.symbol) : pool.baseTokenSymbol || 'UNKNOWN';
      const tokenB = pool.quoteTokenAddress ? resolveTokenLabel(pool.quoteTokenAddress, geckoMetadata, pool.quoteTokenSymbol || 'UNKNOWN', gmgn.byToken.get(pool.quoteTokenAddress)?.symbol) : pool.quoteTokenSymbol || 'UNKNOWN';
      const tvl = marketData?.reserveUsd ?? pool.reserveUsd;
      const volume24h = marketData?.volume24h ?? pool.volume24h;
      resultMap.set(address, { id: pool.id, address, pair: `${tokenA}/${tokenB}`, tokenA, tokenB, tokenAName: pool.baseTokenName || resolveTokenName(pool.baseTokenAddress || '', geckoMetadata), tokenBName: pool.quoteTokenName || resolveTokenName(pool.quoteTokenAddress || '', geckoMetadata), tokenAAddress: pool.baseTokenAddress, tokenBAddress: pool.quoteTokenAddress, currentPrice: marketData?.baseTokenPriceUsd ?? pool.priceUsd, priceChange24h: marketData?.priceChange24h ?? pool.priceChange24h, tvl, volume24h, volumeToTVL: tvl && tvl > 0 && volume24h != null ? volume24h / tvl : null, protocol: 'Robinhood DLMM', status: 'active', discoverySource: 'geckoterminal-search', gmgn: pool.baseTokenAddress ? gmgn.byToken.get(pool.baseTokenAddress) ?? null : null });
    }

    // Search is intentionally more permissive than the main scanner: a pool
    // with TVL 0 or unresolved TVL should still be discoverable by address/name.
    const results = Array.from(resultMap.values()).slice(0, MAX_RESULTS);
    return NextResponse.json({ status: 'live', query, results, discovery: { source: geckoResults.length ? 'geckoterminal+robinhood' : 'robinhood-index', searched: true, indexedPools: indexed.length, geckoResults: geckoResults.length, gmgnTokensReturned: gmgn.tokensReturned, marketPoolsReturned: market.poolsReturned, marketBatchesSucceeded: market.batchesSucceeded, marketBatchesAttempted: market.batchesAttempted, note: 'Main scanner hides zero/unresolved liquidity. On-demand search keeps those pools discoverable so users can open and investigate them.' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pool discovery failed';
    return NextResponse.json({ status: 'error', query, results: [], error: message }, { status: 503 });
  }
}
