'use server';

import { NextResponse } from 'next/server';
import { fetchGeckoPoolMarketData } from '@/lib/geckoTerminal';

const CHAIN_ID = 4663;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const API_VERSION = '1.7-onchain-tvl-token-registry';
const ERC20_SYMBOL_SELECTOR = '0x95d89b41';
const ERC20_NAME_SELECTOR = '0x06fdde03';
const ERC20_BALANCE_OF_PREFIX = '0x70a08231';
const GECKO_BASE_URL = 'https://api.geckoterminal.com/api/v2';
const GECKO_NETWORK = 'robinhood';
const TOKEN_PRICE_BATCH_SIZE = 30;

// High-confidence metadata from official Robinhood token registry / well-known Robinhood Chain assets.
const TOKEN_REGISTRY: Record<string, { symbol: string; name?: string }> = {
  [WETH_ADDRESS.toLowerCase()]: { symbol: 'WETH', name: 'Wrapped Ether' },
  [USDG_ADDRESS.toLowerCase()]: { symbol: 'USDG', name: 'Global Dollar' },
  '0x45242320dbb855eea8fd36804c6487e10e97fcf9': { symbol: 'TENDIES', name: 'TENDIES' },
  '0xd928a068d2b90798373a470c9d9ba562322acdef': { symbol: 'PURR', name: 'Purr Cat' },
  '0x020bfc650a365f8bb26819deaabf3e21291018b4': { symbol: 'CASHCAT', name: 'Cash Cat' },
  '0x117cc2133c37b721f49de2a7a74833232b3b4c0c': { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust • Robinhood Token' },
  '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9': { symbol: 'AAPL', name: 'Apple • Robinhood Token' },
  '0x86923f96303d656e4aa86d9d42d1e57ad2023fdc': { symbol: 'AMD', name: 'AMD • Robinhood Token' },
  '0x12f190a9f9d7d37a250758b26824b97ce941bf54': { symbol: 'AMZN', name: 'Amazon • Robinhood Token' },
  '0x6330d8c3178a418788df01a47479c0ce7ccf450b': { symbol: 'COIN', name: 'Coinbase • Robinhood Token' },
  '0x1b0e319c6a659f002271b69db8a7df2f911c153e': { symbol: 'GME', name: 'GameStop • Robinhood Token' },
  '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3': { symbol: 'GOOGL', name: 'Alphabet Class A • Robinhood Token' },
  '0xc0d6457c16cc70d6790dd43521c899c87ce02f35': { symbol: 'META', name: 'Meta Platforms • Robinhood Token' },
  '0xe93237c50d904957cf27e7b1133b510c669c2e74': { symbol: 'MSFT', name: 'Microsoft • Robinhood Token' },
  '0xff080c8ce2e5feadaca0da81314ae59d232d4afd': { symbol: 'MU', name: 'Micron Technology • Robinhood Token' },
  '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec': { symbol: 'NVDA', name: 'NVIDIA • Robinhood Token' },
  '0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a': { symbol: 'PLTR', name: 'Palantir • Robinhood Token' },
  '0xb90a19ff0af67f7779aff50a882a9cff42446400': { symbol: 'SNDK', name: 'SanDisk • Robinhood Token' },
  '0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea': { symbol: 'SPCX', name: 'SpaceX • Robinhood Token' },
  '0x322f0929c4625ed5bad873c95208d54e1c003b2d': { symbol: 'TSLA', name: 'Tesla • Robinhood Token' },
  '0xd5f3879160bc7c32ebb4dc785f8a4f505888de68': { symbol: 'QQQ', name: 'Invesco QQQ • Robinhood Token' },
  '0xec262a75e413fafd0df80480274532c79d42da09': { symbol: 'MSTR', name: 'Strategy • Robinhood Token' },
  '0xc9a981fee1f9dec688bb123ccdecc63d0de bfc4'.replace(/\s/g, ''): { symbol: 'GLD', name: 'SPDR Gold Shares • Robinhood Token' },
};

async function rpcCall(method: string, params: unknown[] = []): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: string; error?: { message?: string } };
  if (data.error || !data.result) throw new Error(data.error?.message || 'RPC response missing result');
  return data.result;
}

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const body = await res.json() as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (!res.ok || body.errors?.length) throw new Error(body.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Subgraph HTTP ${res.status}`);
  return body.data || {};
}

function poolAddress(id: string): string {
  const separator = id.indexOf(':');
  return (separator >= 0 ? id.slice(separator + 1) : id).toLowerCase();
}

function registryMetadata(address: string): { symbol: string; name?: string } | null {
  return TOKEN_REGISTRY[address.toLowerCase()] || null;
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\0/g, '').trim();
  if (!text || text === 'UNKNOWN' || text === '???' || text.includes('…') || text.includes('...') || /^0x/i.test(text)) return null;
  return text;
}

function decodeAbiString(hex: string): string | null {
  if (!hex || hex === '0x') return null;
  try {
    const bytes = hex.slice(2);
    if (bytes.length >= 128) {
      const offset = Number(BigInt(`0x${bytes.slice(0, 64)}`));
      const lenStart = offset * 2;
      const length = Number(BigInt(`0x${bytes.slice(lenStart, lenStart + 64)}`));
      const data = bytes.slice(lenStart + 64, lenStart + 64 + length * 2);
      const decoded = Buffer.from(data, 'hex').toString('utf8');
      if (decoded.trim()) return cleanText(decoded);
    }
    const bytes32 = Buffer.from(bytes.slice(0, 64), 'hex').toString('utf8');
    return cleanText(bytes32);
  } catch {
    return null;
  }
}

function encodeAddressCall(prefix: string, address: string): string {
  return `${prefix}${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

function decodeUint(hex: string): bigint | null {
  try {
    if (!hex || hex === '0x') return null;
    return BigInt(hex);
  } catch {
    return null;
  }
}

async function resolveTokenMetadata(addresses: string[]): Promise<Map<string, { symbol: string | null; name: string | null }>> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase())));
  const metadata = new Map<string, { symbol: string | null; name: string | null }>();

  for (const address of unique) {
    const known = registryMetadata(address);
    if (known) metadata.set(address, { symbol: known.symbol, name: known.name || null });
  }

  const unresolved = unique.filter((address) => !metadata.has(address));
  const concurrency = 16;
  for (let i = 0; i < unresolved.length; i += concurrency) {
    const batch = unresolved.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (address) => {
      try {
        const [symbolResult, nameResult] = await Promise.all([
          rpcCall('eth_call', [{ to: address, data: ERC20_SYMBOL_SELECTOR }, 'latest']),
          rpcCall('eth_call', [{ to: address, data: ERC20_NAME_SELECTOR }, 'latest']),
        ]);
        return { address, symbol: decodeAbiString(symbolResult), name: decodeAbiString(nameResult) };
      } catch {
        return { address, symbol: null, name: null };
      }
    }));
    for (const item of results) metadata.set(item.address, { symbol: item.symbol, name: item.name });
  }
  return metadata;
}

async function fetchTokenPrices(addresses: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(addresses.map((address) => address.toLowerCase())));
  const prices = new Map<string, number>();
  for (const address of unique) {
    if (address === USDG_ADDRESS.toLowerCase()) prices.set(address, 1);
  }

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += TOKEN_PRICE_BATCH_SIZE) batches.push(unique.slice(i, i + TOKEN_PRICE_BATCH_SIZE));
  const results = await Promise.allSettled(batches.map(async (batch) => {
    const encoded = batch.join(',');
    const response = await fetch(`${GECKO_BASE_URL}/simple/networks/${GECKO_NETWORK}/token_price/${encoded}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`GeckoTerminal token price HTTP ${response.status}`);
    const body = await response.json() as { data?: Record<string, { attributes?: { token_prices?: Record<string, string> } }> };
    const tokenPrices = body.data?.attributes?.token_prices || {};
    return Object.entries(tokenPrices).flatMap(([address, price]) => {
      const value = Number(price);
      return Number.isFinite(value) && value > 0 ? [{ address: address.toLowerCase(), value }] : [];
    });
  }));
  for (const result of results) if (result.status === 'fulfilled') for (const item of result.value) prices.set(item.address, item.value);
  return prices;
}

async function fetchPoolBalances(poolAddressValue: string, tokenAddresses: string[]): Promise<[bigint | null, bigint | null]> {
  const results = await Promise.all(tokenAddresses.map(async (tokenAddress) => {
    try {
      const result = await rpcCall('eth_call', [{ to: tokenAddress, data: encodeAddressCall(ERC20_BALANCE_OF_PREFIX, poolAddressValue) }, 'latest']);
      return decodeUint(result);
    } catch {
      return null;
    }
  }));
  return [results[0] ?? null, results[1] ?? null];
}

function balanceUsd(balance: bigint | null, decimals: number | null, priceUsd: number | undefined): number | null {
  if (balance === null || decimals === null || !Number.isFinite(decimals) || !priceUsd || priceUsd <= 0) return null;
  const raw = Number(balance);
  if (!Number.isFinite(raw)) return null;
  const amount = raw / 10 ** decimals;
  const usd = amount * priceUsd;
  return Number.isFinite(usd) ? usd : null;
}

interface PoolRow {
  id: string;
  tokenX: { id: string; symbol: string | null; decimals: number | null };
  tokenY: { id: string; symbol: string | null; decimals: number | null };
  binStep: number;
  activeId: number | null;
  reserveX: string;
  reserveY: string;
  totalValueLockedUSD: string | null;
  createdAtBlockNumber: number;
  createdAtTimestamp: number;
  isAlive: boolean;
}

async function fetchPools(): Promise<PoolRow[]> {
  const query = `query GetPools($chainId: Int!, $limit: Int!, $offset: Int!) {
    DLMMPool(where: { chainId: { _eq: $chainId } }, limit: $limit, offset: $offset, order_by: { createdAtTimestamp: asc }) {
      id tokenX { id symbol decimals } tokenY { id symbol decimals } binStep activeId reserveX reserveY totalValueLockedUSD createdAtBlockNumber createdAtTimestamp isAlive
    }
  }`;
  const all: PoolRow[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await subgraphQuery(query, { chainId: CHAIN_ID, limit, offset });
    const rows = (data.DLMMPool as PoolRow[] | undefined) || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

export async function GET() {
  try {
    const [blockHex, chainHex, poolRows] = await Promise.all([
      rpcCall('eth_blockNumber'),
      rpcCall('eth_chainId'),
      fetchPools(),
    ]);

    const blockNumber = parseInt(blockHex, 16);
    const chainId = parseInt(chainHex, 16);
    if (chainId !== CHAIN_ID) return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}`, pools: [] }, { status: 502 });

    const tokenAddresses = poolRows.flatMap((pool) => [pool.tokenX.id, pool.tokenY.id]);
    const [market, tokenMetadata, tokenPrices] = await Promise.all([
      fetchGeckoPoolMarketData(poolRows.map((pool) => poolAddress(pool.id))),
      resolveTokenMetadata(tokenAddresses),
      fetchTokenPrices(tokenAddresses),
    ]);

    const zeroOrMissingTvlPools = poolRows.filter((pool) => {
      const tvl = Number(pool.totalValueLockedUSD ?? 0);
      return !Number.isFinite(tvl) || tvl <= 0;
    });

    const onchainBalances = new Map<string, [bigint | null, bigint | null]>();
    const balanceConcurrency = 10;
    for (let i = 0; i < zeroOrMissingTvlPools.length; i += balanceConcurrency) {
      const batch = zeroOrMissingTvlPools.slice(i, i + balanceConcurrency);
      const results = await Promise.all(batch.map(async (pool) => {
        const address = poolAddress(pool.id);
        return [address, await fetchPoolBalances(address, [pool.tokenX.id, pool.tokenY.id])] as const;
      }));
      for (const [address, balances] of results) onchainBalances.set(address, balances);
    }

    const pools = poolRows.map((pool) => {
      const address = poolAddress(pool.id);
      const tokenAMetadata = tokenMetadata.get(pool.tokenX.id.toLowerCase());
      const tokenBMetadata = tokenMetadata.get(pool.tokenY.id.toLowerCase());
      const tokenA = registryMetadata(pool.tokenX.id)?.symbol || cleanText(pool.tokenX.symbol) || tokenAMetadata?.symbol || null;
      const tokenB = registryMetadata(pool.tokenY.id)?.symbol || cleanText(pool.tokenY.symbol) || tokenBMetadata?.symbol || null;
      const marketData = market.byPool.get(address);
      const subgraphTvl = pool.totalValueLockedUSD === null ? null : Number(pool.totalValueLockedUSD);
      const reserveTvl = marketData?.reserveUsd ?? null;
      const onchain = onchainBalances.get(address);
      const onchainAUsd = onchain ? balanceUsd(onchain[0], pool.tokenX.decimals, tokenPrices.get(pool.tokenX.id.toLowerCase())) : null;
      const onchainBUsd = onchain ? balanceUsd(onchain[1], pool.tokenY.decimals, tokenPrices.get(pool.tokenY.id.toLowerCase())) : null;
      const onchainTvl = onchainAUsd !== null && onchainBUsd !== null ? onchainAUsd + onchainBUsd : null;
      const tvl = subgraphTvl !== null && Number.isFinite(subgraphTvl) && subgraphTvl > 0
        ? subgraphTvl
        : reserveTvl !== null && Number.isFinite(reserveTvl) && reserveTvl > 0
          ? reserveTvl
          : onchainTvl !== null && onchainTvl > 0
            ? onchainTvl
            : null;
      const volume24h = marketData?.volume24h ?? null;
      const volumeToTVL = tvl !== null && tvl > 0 && volume24h !== null ? volume24h / tvl : null;

      return {
        id: pool.id,
        address,
        pair: `${tokenA || pool.tokenX.id.slice(0, 8)}/${tokenB || pool.tokenY.id.slice(0, 8)}`,
        tokenA,
        tokenB,
        tokenAName: tokenAMetadata?.name || registryMetadata(pool.tokenX.id)?.name || null,
        tokenBName: tokenBMetadata?.name || registryMetadata(pool.tokenY.id)?.name || null,
        tokenAAddress: pool.tokenX.id,
        tokenBAddress: pool.tokenY.id,
        decimalsA: pool.tokenX.decimals,
        decimalsB: pool.tokenY.decimals,
        protocol: 'Ramses DLMM',
        currentPrice: null,
        priceChange24h: null,
        binStep: pool.binStep,
        activeBin: pool.activeId,
        fee: null,
        tvl,
        tvlSource: subgraphTvl !== null && Number.isFinite(subgraphTvl) && subgraphTvl > 0
          ? 'subgraph'
          : reserveTvl !== null && Number.isFinite(reserveTvl) && reserveTvl > 0
            ? 'geckoterminal'
            : onchainTvl !== null && onchainTvl > 0
              ? 'onchain-token-balances'
              : 'unresolved',
        reserveX: pool.reserveX,
        reserveY: pool.reserveY,
        onchainBalanceX: onchain?.[0]?.toString() ?? null,
        onchainBalanceY: onchain?.[1]?.toString() ?? null,
        tokenAPriceUsd: tokenPrices.get(pool.tokenX.id.toLowerCase()) ?? null,
        tokenBPriceUsd: tokenPrices.get(pool.tokenY.id.toLowerCase()) ?? null,
        volume1h: marketData?.volume1h ?? null,
        volume6h: marketData?.volume6h ?? null,
        volume24h,
        volumeRaw24h: null,
        volumeToTVL,
        volatility: null,
        analyticsScore: null,
        riskLevel: null,
        estimatedAPR: null,
        timeInRange: null,
        swapCount24h: marketData?.swapCount24h ?? null,
        swapCount1h: marketData?.swapCount1h ?? null,
        status: pool.isAlive ? 'active' : 'inactive',
        createdBlock: pool.createdAtBlockNumber,
        createdAt: pool.createdAtTimestamp ? new Date(pool.createdAtTimestamp * 1000).toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      apiVersion: API_VERSION,
      status: 'live',
      chainId,
      blockNumber,
      pools,
      dataQuality: {
        poolSource: 'Robinhood Chain RPC + Ramses DLMM subgraph',
        tokenMetadataSource: 'Official registry + Ramses subgraph + Robinhood Chain ERC-20 symbol()/name()',
        volumeSource: 'GeckoTerminal pool market data',
        tokenPriceSource: 'GeckoTerminal token prices with USDG fixed at $1',
        tvlSource: 'Subgraph TVL -> GeckoTerminal exact-pool reserve USD -> on-chain ERC-20 balances x token USD prices',
        volumeWindowSeconds: 86_400,
        volumeComplete: market.complete,
        poolsDiscovered: poolRows.length,
        poolsWithMarketData: market.poolsReturned,
        poolsWithResolvedTokenSymbols: pools.filter((pool) => pool.tokenA !== null && pool.tokenB !== null).length,
        tvlResolved: pools.filter((pool) => pool.tvl !== null).length,
        tvlFromSubgraph: pools.filter((pool) => pool.tvlSource === 'subgraph').length,
        tvlFromGeckoTerminal: pools.filter((pool) => pool.tvlSource === 'geckoterminal').length,
        tvlFromOnchainBalances: pools.filter((pool) => pool.tvlSource === 'onchain-token-balances').length,
        tvlUnresolved: pools.filter((pool) => pool.tvlSource === 'unresolved').length,
        onchainBalanceFallbackChecked: zeroOrMissingTvlPools.length,
        note: 'Binara never substitutes token-wide liquidity for pool TVL. On-chain fallback is calculated only from the exact pool address balances and live token USD prices. If both cannot be verified, TVL remains unresolved rather than fabricated.',
      },
      indexer: {
        status: 'live',
        lastIndexedBlock: blockNumber,
        lastIndexedTimestamp: Date.now(),
        poolsDiscovered: pools.length,
        swapsIndexed: null,
        protocol: 'Ramses DLMM',
        factoryAddress: '0xdcD5F77697914E27f56FD263EF82923C8524AbAc',
        subgraphEndpoint: SUBGRAPH_URL,
        error: null,
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown live data error';
    return NextResponse.json({ apiVersion: API_VERSION, status: 'error', error: 'Unable to retrieve live Robinhood Chain data.', detail: message, pools: [] }, { status: 503 });
  }
}
