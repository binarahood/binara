const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

const ERC20_SYMBOL = '0x95d89b41';
const ERC20_DECIMALS = '0x313ce567';

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  source: 'known' | 'rpc' | 'address';
}

const cache = new Map<string, TokenMetadata>();

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const dataJson = await res.json() as { result?: string; error?: { message?: string } };
  if (dataJson.error || !dataJson.result) {
    throw new Error(dataJson.error?.message || 'RPC eth_call failed');
  }
  return dataJson.result;
}

function decodeUint256(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean) return 0n;
  return BigInt(`0x${clean.slice(0, 64).padStart(64, '0')}`);
}

function decodeSymbol(hex: string): string | null {
  try {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (!clean) return null;

    // Standard ABI dynamic string: offset + length + bytes.
    if (clean.length >= 128) {
      const length = Number(BigInt(`0x${clean.slice(64, 128)}`));
      if (length > 0 && length <= 64 && 128 + length * 2 <= clean.length) {
        const value = Buffer.from(clean.slice(128, 128 + length * 2), 'hex')
          .toString('utf8').replace(/\0/g, '').trim();
        if (value) return value;
      }
    }

    // bytes32 symbol fallback.
    const value = Buffer.from(clean.slice(0, 64), 'hex')
      .toString('utf8').replace(/\0/g, '').trim();
    return value || null;
  } catch {
    return null;
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function knownMetadata(address: string): TokenMetadata | null {
  const lower = address.toLowerCase();
  if (lower === WETH_ADDRESS.toLowerCase()) {
    return { address, symbol: 'WETH', decimals: 18, source: 'known' };
  }
  if (lower === USDG_ADDRESS.toLowerCase()) {
    return { address, symbol: 'USDG', decimals: 18, source: 'known' };
  }
  return null;
}

export async function getTokenMetadata(address: string | null | undefined): Promise<TokenMetadata> {
  const normalized = String(address || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return { address: normalized, symbol: 'UNKNOWN', decimals: 18, source: 'address' };
  }

  const key = normalized.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const known = knownMetadata(normalized);
  if (known) {
    cache.set(key, known);
    return known;
  }

  try {
    const [symbolHex, decimalsHex] = await Promise.all([
      ethCall(normalized, ERC20_SYMBOL),
      ethCall(normalized, ERC20_DECIMALS),
    ]);

    const symbol = decodeSymbol(symbolHex);
    const decimalsNumber = Number(decodeUint256(decimalsHex));
    const metadata: TokenMetadata = {
      address: normalized,
      symbol: symbol && symbol.length <= 32 ? symbol : shortAddress(normalized),
      decimals: Number.isInteger(decimalsNumber) && decimalsNumber >= 0 && decimalsNumber <= 36
        ? decimalsNumber
        : 18,
      source: symbol ? 'rpc' : 'address',
    };

    cache.set(key, metadata);
    return metadata;
  } catch {
    const fallback: TokenMetadata = {
      address: normalized,
      symbol: shortAddress(normalized),
      decimals: 18,
      source: 'address',
    };
    cache.set(key, fallback);
    return fallback;
  }
}

export async function resolveTokenPair(
  tokenAAddress: string,
  tokenBAddress: string,
  currentA?: string | null,
  currentB?: string | null,
  decimalsA?: number,
  decimalsB?: number,
): Promise<{ tokenA: TokenMetadata; tokenB: TokenMetadata; pair: string }> {
  const validSymbol = (value?: string | null) => {
    const symbol = String(value || '').trim();
    if (!symbol) return false;
    if (symbol === '???' || symbol === 'UNKNOWN') return false;
    return !/^0x[a-fA-F0-9]{8,}$/.test(symbol);
  };

  const [resolvedA, resolvedB] = await Promise.all([
    getTokenMetadata(tokenAAddress),
    getTokenMetadata(tokenBAddress),
  ]);

  const tokenA: TokenMetadata = {
    ...resolvedA,
    symbol: validSymbol(currentA) ? String(currentA).trim() : resolvedA.symbol,
    decimals: Number.isFinite(decimalsA) && Number(decimalsA) >= 0 ? Number(decimalsA) : resolvedA.decimals,
  };
  const tokenB: TokenMetadata = {
    ...resolvedB,
    symbol: validSymbol(currentB) ? String(currentB).trim() : resolvedB.symbol,
    decimals: Number.isFinite(decimalsB) && Number(decimalsB) >= 0 ? Number(decimalsB) : resolvedB.decimals,
  };

  return { tokenA, tokenB, pair: `${tokenA.symbol}/${tokenB.symbol}` };
}
