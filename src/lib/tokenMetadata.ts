export interface TokenMetadata {
  address: string;
  symbol: string | null;
  name: string | null;
  source: 'robinhood' | 'blockscout' | 'gmgn' | 'subgraph' | 'unknown';
}

const ROBINHOOD_ASSETS_URL = 'https://api.robinhood.com/rhj/assets';
const BLOCKSCOUT_BASE_URL = 'https://robinhoodchain.blockscout.com/api/v2/tokens';
const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v : null;
}

function addressOf(value: unknown): string | null {
  const v = clean(value)?.toLowerCase() ?? null;
  return v && /^0x[a-f0-9]{40}$/.test(v) ? v : null;
}

function normalizeRobinhoodAssets(payload: unknown): TokenMetadata[] {
  const assets = Array.isArray((payload as { assets?: unknown[] })?.assets)
    ? (payload as { assets: unknown[] }).assets
    : [];
  const result: TokenMetadata[] = [];

  for (const asset of assets) {
    const item = asset as { tokenSymbol?: unknown; tokenName?: unknown; deployments?: unknown[] };
    const symbol = clean(item.tokenSymbol);
    const name = clean(item.tokenName);
    for (const deployment of Array.isArray(item.deployments) ? item.deployments : []) {
      const d = deployment as { contractAddress?: unknown; chainId?: unknown };
      if (Number(d.chainId) !== 4663) continue;
      const address = addressOf(d.contractAddress);
      if (!address) continue;
      result.push({ address, symbol, name, source: 'robinhood' });
    }
  }
  return result;
}

async function fetchJson(url: string, revalidate: number): Promise<unknown | null> {
  try {
    const response = await fetch(url, { next: { revalidate } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchBlockscout(address: string): Promise<TokenMetadata | null> {
  const payload = await fetchJson(`${BLOCKSCOUT_BASE_URL}/${address}`, 600);
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as { symbol?: unknown; name?: unknown };
  const symbol = clean(data.symbol);
  const name = clean(data.name);
  if (!symbol && !name) return null;
  return { address, symbol, name, source: 'blockscout' };
}

export async function fetchTokenMetadata(addresses: string[]): Promise<Map<string, TokenMetadata>> {
  const unique = Array.from(new Set(addresses.map((a) => addressOf(a)).filter((a): a is string => Boolean(a))));
  const result = new Map<string, TokenMetadata>();

  result.set(WETH, { address: WETH, symbol: 'WETH', name: 'Wrapped Ether', source: 'robinhood' });
  result.set(USDG, { address: USDG, symbol: 'USDG', name: 'Global Dollar', source: 'robinhood' });

  const robinhood = await fetchJson(ROBINHOOD_ASSETS_URL, 3600);
  for (const item of normalizeRobinhoodAssets(robinhood)) result.set(item.address, item);

  const unresolved = unique.filter((address) => !result.has(address));
  const concurrency = 10;
  for (let i = 0; i < unresolved.length; i += concurrency) {
    const batch = unresolved.slice(i, i + concurrency);
    const metadata = await Promise.all(batch.map(fetchBlockscout));
    for (const item of metadata) if (item) result.set(item.address, item);
  }

  return result;
}

export function resolveTokenLabel(
  address: string,
  metadata: Map<string, TokenMetadata>,
  fallback: string,
  gmgnSymbol?: string | null,
): string {
  const normalized = address.toLowerCase();
  const gmgn = clean(gmgnSymbol);
  if (gmgn) return gmgn;
  const item = metadata.get(normalized);
  return item?.symbol || fallback;
}

export function resolveTokenName(
  address: string,
  metadata: Map<string, TokenMetadata>,
): string | null {
  return metadata.get(address.toLowerCase())?.name ?? null;
}
