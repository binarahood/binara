'use server';

import { NextRequest, NextResponse } from 'next/server';

const CHAIN_ID = 4663;
const FACTORY_ADDRESS = '0xdcD5F77697914E27f56FD263EF82923C8524AbAc';
const SUBGRAPH_URL = 'https://gateway.kingdom.dev/robinhood/subgraph/v1/graphql';
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

// ─── RPC helpers ──────────────────────────────────────────────────────────────

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC: ${data.error.message}`);
  return data.result;
}

async function ethCall(to: string, data: string): Promise<string> {
  const result = await rpcCall('eth_call', [{ to, data }, 'latest']);
  return result as string;
}

// ─── ABI decode helpers ───────────────────────────────────────────────────────

function decodeUint256(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean || clean.length < 64) return 0n;
  return BigInt('0x' + clean.slice(0, 64));
}

function decodeUint24(hex: string): number {
  return Number(decodeUint256(hex));
}

function decodeAddress(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 64) return '0x0000000000000000000000000000000000000000';
  return '0x' + clean.slice(24, 64);
}

function decodeString(hex: string): string {
  try {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length < 128) {
      const bytes = Buffer.from(clean.slice(0, 64), 'hex');
      return bytes.toString('utf8').replace(/\0/g, '').trim() || '???';
    }
    const lengthHex = clean.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    if (length === 0 || length > 100) {
      const bytes = Buffer.from(clean.slice(0, 64), 'hex');
      return bytes.toString('utf8').replace(/\0/g, '').trim() || '???';
    }
    const strHex = clean.slice(128, 128 + length * 2);
    return Buffer.from(strHex, 'hex').toString('utf8').trim() || '???';
  } catch {
    return '???';
  }
}

// ─── DLMM price formula ───────────────────────────────────────────────────────

function priceFromBinId(binId: number, binStep: number): number {
  const base = 1 + binStep / 10_000;
  const exponent = binId - 8_388_608;
  return Math.pow(base, exponent);
}

// ─── Token metadata cache ─────────────────────────────────────────────────────

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x0bd7d308f8e1639fab988df18a8011f41eacad73': { symbol: 'WETH', decimals: 18 },
  '0x5fc5360d0400a0fd4f2af552add042d716f1d168': { symbol: 'USDG', decimals: 18 },
};

async function getTokenMeta(address: string): Promise<{ symbol: string; decimals: number }> {
  const key = address.toLowerCase();
  if (KNOWN_TOKENS[key]) return KNOWN_TOKENS[key];
  try {
    const [symHex, decHex] = await Promise.all([
      ethCall(address, '0x95d89b41'),
      ethCall(address, '0x313ce567'),
    ]);
    const symbol = decodeString(symHex);
    const decimals = Number(decodeUint256(decHex));
    const meta = { symbol: symbol || key.slice(2, 8).toUpperCase(), decimals: decimals || 18 };
    KNOWN_TOKENS[key] = meta;
    return meta;
  } catch {
    return { symbol: key.slice(2, 8).toUpperCase(), decimals: 18 };
  }
}

// ─── Subgraph query ───────────────────────────────────────────────────────────

async function subgraphQuery(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(`Subgraph: ${data.errors[0]?.message}`);
  return data.data;
}

// ─── Position discovery via subgraph ─────────────────────────────────────────

interface SubgraphPosition {
  id: string;
  user?: string;
  owner?: string;
  lbPair?: { id: string; binStep: number; activeId: number | null; tokenX: { id: string; symbol: string; decimals: number }; tokenY: { id: string; symbol: string; decimals: number } };
  pool?: { id: string; binStep: number; activeId: number | null; tokenX: { id: string; symbol: string; decimals: number }; tokenY: { id: string; symbol: string; decimals: number } };
  lowerBin?: number;
  upperBin?: number;
  binIdLower?: number;
  binIdUpper?: number;
  liquidity?: string;
  totalLiquidity?: string;
  depositedX?: string;
  depositedY?: string;
  withdrawnX?: string;
  withdrawnY?: string;
  collectedFeesX?: string;
  collectedFeesY?: string;
  unclaimedFeesX?: string;
  unclaimedFeesY?: string;
}

async function fetchPositionsFromSubgraph(walletAddress: string): Promise<SubgraphPosition[]> {
  const addr = walletAddress.toLowerCase();

  // Try multiple possible entity names used by Ramses/Trader Joe subgraphs
  const queries = [
    // Trader Joe v2.1 style
    `query GetPositions($user: String!, $chainId: Int!) {
      LBPosition(where: { user: { _eq: $user }, chainId: { _eq: $chainId } }, limit: 100) {
        id
        user
        lbPair { id binStep activeId tokenX { id symbol decimals } tokenY { id symbol decimals } }
        lowerBin
        upperBin
        liquidity
        depositedX
        depositedY
        withdrawnX
        withdrawnY
        collectedFeesX
        collectedFeesY
        unclaimedFeesX
        unclaimedFeesY
      }
    }`,
    // Alternative: DLMMPosition
    `query GetPositions($user: String!, $chainId: Int!) {
      DLMMPosition(where: { user: { _eq: $user }, chainId: { _eq: $chainId } }, limit: 100) {
        id
        user
        pool { id binStep activeId tokenX { id symbol decimals } tokenY { id symbol decimals } }
        binIdLower
        binIdUpper
        totalLiquidity
        depositedX
        depositedY
        collectedFeesX
        collectedFeesY
        unclaimedFeesX
        unclaimedFeesY
      }
    }`,
    // Alternative: owner field
    `query GetPositions($user: String!, $chainId: Int!) {
      LBPosition(where: { owner: { _eq: $user }, chainId: { _eq: $chainId } }, limit: 100) {
        id
        owner
        lbPair { id binStep activeId tokenX { id symbol decimals } tokenY { id symbol decimals } }
        lowerBin
        upperBin
        liquidity
        depositedX
        depositedY
        collectedFeesX
        collectedFeesY
        unclaimedFeesX
        unclaimedFeesY
      }
    }`,
  ];

  for (const query of queries) {
    try {
      const data = await subgraphQuery(query, { user: addr, chainId: CHAIN_ID }) as Record<string, SubgraphPosition[]>;
      const key = Object.keys(data)[0];
      if (key && Array.isArray(data[key]) && data[key].length > 0) {
        return data[key];
      }
    } catch {
      // Try next query variant
    }
  }

  return [];
}

// ─── RPC-based bin scanning for a wallet's positions ─────────────────────────

// LBPair ABI selectors
const LBPAIR_GET_ACTIVE_ID = '0xd0c27c4f';
const LBPAIR_GET_BIN = '0x8da5cb5b'; // getBin(uint24 id) returns (uint128 binReserveX, uint128 binReserveY)
const LBPAIR_BALANCE_OF = '0x00fdd58e'; // balanceOf(address account, uint256 id) returns (uint256)
const LBPAIR_TOKEN_X = '0x4f5dce83';
const LBPAIR_TOKEN_Y = '0x273a8a2e';
const LBPAIR_BIN_STEP = '0x6a1db1bf';
const LBPAIR_TOTAL_SUPPLY = '0xbd85b039'; // totalSupply(uint256 id) returns (uint256)

function encodeBinBalanceOf(walletAddress: string, binId: number): string {
  const addrPadded = walletAddress.replace('0x', '').padStart(64, '0');
  const binPadded = binId.toString(16).padStart(64, '0');
  return LBPAIR_BALANCE_OF + addrPadded + binPadded;
}

function encodeGetBin(binId: number): string {
  const binPadded = binId.toString(16).padStart(64, '0');
  return LBPAIR_GET_BIN + binPadded;
}

function encodeTotalSupply(binId: number): string {
  const binPadded = binId.toString(16).padStart(64, '0');
  return LBPAIR_TOTAL_SUPPLY + binPadded;
}

// Scan a range of bins around the active bin to find user's liquidity
async function scanUserBinsInPool(
  poolAddress: string,
  walletAddress: string,
  activeBin: number,
  binStep: number,
  scanRadius = 200
): Promise<{ binId: number; userLiquidity: bigint; totalLiquidity: bigint; reserveX: bigint; reserveY: bigint }[]> {
  const results: { binId: number; userLiquidity: bigint; totalLiquidity: bigint; reserveX: bigint; reserveY: bigint }[] = [];
  const startBin = Math.max(0, activeBin - scanRadius);
  const endBin = activeBin + scanRadius;

  // Batch calls in groups of 20
  const batchSize = 20;
  for (let bin = startBin; bin <= endBin; bin += batchSize) {
    const batchEnd = Math.min(bin + batchSize - 1, endBin);
    const batchBins = Array.from({ length: batchEnd - bin + 1 }, (_, i) => bin + i);

    const balanceCalls = batchBins.map((binId) => ({
      jsonrpc: '2.0',
      id: binId,
      method: 'eth_call',
      params: [{ to: poolAddress, data: encodeBinBalanceOf(walletAddress, binId) }, 'latest'],
    }));

    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(balanceCalls),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const batchResults = await res.json() as Array<{ id: number; result?: string; error?: unknown }>;

      const nonZeroBins: number[] = [];
      for (const r of batchResults) {
        if (r.result && r.result !== '0x' && r.result !== '0x' + '0'.repeat(64)) {
          const balance = BigInt(r.result);
          if (balance > 0n) {
            nonZeroBins.push(r.id);
          }
        }
      }

      // For bins with non-zero balance, fetch reserves and total supply
      for (const binId of nonZeroBins) {
        try {
          const [balHex, binHex, supplyHex] = await Promise.all([
            ethCall(poolAddress, encodeBinBalanceOf(walletAddress, binId)),
            ethCall(poolAddress, encodeGetBin(binId)),
            ethCall(poolAddress, encodeTotalSupply(binId)),
          ]);

          const userLiquidity = BigInt(balHex || '0x0');
          const totalLiquidity = BigInt(supplyHex || '0x0');

          const cleanBin = (binHex || '').startsWith('0x') ? binHex.slice(2) : binHex;
          const reserveX = cleanBin.length >= 64 ? BigInt('0x' + cleanBin.slice(0, 64)) : 0n;
          const reserveY = cleanBin.length >= 128 ? BigInt('0x' + cleanBin.slice(64, 128)) : 0n;

          if (userLiquidity > 0n) {
            results.push({ binId, userLiquidity, totalLiquidity, reserveX, reserveY });
          }
        } catch {
          // skip this bin
        }
      }
    } catch {
      // skip batch
    }
  }

  return results;
}

// ─── Position builder ─────────────────────────────────────────────────────────

export interface DLMMPosition {
  positionId: string;
  poolAddress: string;
  pair: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAddress: string;
  tokenBAddress: string;
  decimalsA: number;
  decimalsB: number;
  fee: number;
  binStep: number;
  activeBin: number | null;
  userBins: number[];
  lowerBin: number | null;
  upperBin: number | null;
  lowerPrice: number | null;
  upperPrice: number | null;
  currentPrice: number | null;
  tokenAAmount: string;   // human-readable
  tokenBAmount: string;   // human-readable
  tokenARaw: string;      // raw bigint string
  tokenBRaw: string;
  currentValueUSD: number | null;
  unclaimedFeeA: string;
  unclaimedFeeB: string;
  unclaimedFeeARaw: string;
  unclaimedFeeBRaw: string;
  unclaimedFeeUSD: number | null;
  inRange: boolean;
  distToLowerPct: number | null;
  distToUpperPct: number | null;
  dataSource: 'subgraph' | 'rpc';
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

async function buildPositionFromSubgraph(sp: SubgraphPosition): Promise<DLMMPosition | null> {
  try {
    const pairData = sp.lbPair || sp.pool;
    if (!pairData) return null;

    const poolAddress = pairData.id;
    const binStep = pairData.binStep || 1;
    const tokenA = pairData.tokenX;
    const tokenB = pairData.tokenY;

    // Get live active bin from RPC
    let activeBin: number | null = pairData.activeId ?? null;
    try {
      const activeIdHex = await ethCall(poolAddress, LBPAIR_GET_ACTIVE_ID);
      activeBin = decodeUint24(activeIdHex);
    } catch { /* use subgraph value */ }

    const lowerBin = sp.lowerBin ?? sp.binIdLower ?? null;
    const upperBin = sp.upperBin ?? sp.binIdUpper ?? null;

    const lowerPrice = lowerBin !== null ? priceFromBinId(lowerBin, binStep) : null;
    const upperPrice = upperBin !== null ? priceFromBinId(upperBin, binStep) : null;
    const currentPrice = activeBin !== null ? priceFromBinId(activeBin, binStep) : null;

    const inRange = activeBin !== null && lowerBin !== null && upperBin !== null
      ? activeBin >= lowerBin && activeBin <= upperBin
      : false;

    const distToLowerPct = currentPrice !== null && lowerPrice !== null && currentPrice > 0
      ? ((currentPrice - lowerPrice) / currentPrice) * 100
      : null;
    const distToUpperPct = currentPrice !== null && upperPrice !== null && currentPrice > 0
      ? ((upperPrice - currentPrice) / currentPrice) * 100
      : null;

    const decimalsA = tokenA.decimals || 18;
    const decimalsB = tokenB.decimals || 18;

    // Parse deposited amounts (net of withdrawals)
    const depX = BigInt(sp.depositedX || '0');
    const depY = BigInt(sp.depositedY || '0');
    const withX = BigInt(sp.withdrawnX || '0');
    const withY = BigInt(sp.withdrawnY || '0');
    const netX = depX > withX ? depX - withX : 0n;
    const netY = depY > withY ? depY - withY : 0n;

    const unclaimedFeeARaw = sp.unclaimedFeesX || '0';
    const unclaimedFeeBRaw = sp.unclaimedFeesY || '0';

    const fee = binStep * 0.01; // base fee %

    return {
      positionId: sp.id,
      poolAddress,
      pair: `${tokenA.symbol}/${tokenB.symbol}`,
      tokenASymbol: tokenA.symbol,
      tokenBSymbol: tokenB.symbol,
      tokenAAddress: tokenA.id,
      tokenBAddress: tokenB.id,
      decimalsA,
      decimalsB,
      fee,
      binStep,
      activeBin,
      userBins: lowerBin !== null && upperBin !== null
        ? Array.from({ length: upperBin - lowerBin + 1 }, (_, i) => lowerBin + i)
        : [],
      lowerBin,
      upperBin,
      lowerPrice,
      upperPrice,
      currentPrice,
      tokenAAmount: formatTokenAmount(netX, decimalsA),
      tokenBAmount: formatTokenAmount(netY, decimalsB),
      tokenARaw: netX.toString(),
      tokenBRaw: netY.toString(),
      currentValueUSD: null, // calculated below
      unclaimedFeeA: formatTokenAmount(BigInt(unclaimedFeeARaw), decimalsA),
      unclaimedFeeB: formatTokenAmount(BigInt(unclaimedFeeBRaw), decimalsB),
      unclaimedFeeARaw,
      unclaimedFeeBRaw,
      unclaimedFeeUSD: null,
      inRange,
      distToLowerPct,
      distToUpperPct,
      dataSource: 'subgraph',
    };
  } catch {
    return null;
  }
}

async function buildPositionFromRPC(
  poolAddress: string,
  walletAddress: string
): Promise<DLMMPosition | null> {
  try {
    // Get pool metadata
    const [tokenXHex, tokenYHex, binStepHex, activeIdHex] = await Promise.all([
      ethCall(poolAddress, LBPAIR_TOKEN_X),
      ethCall(poolAddress, LBPAIR_TOKEN_Y),
      ethCall(poolAddress, LBPAIR_BIN_STEP),
      ethCall(poolAddress, LBPAIR_GET_ACTIVE_ID),
    ]);

    const tokenXAddr = decodeAddress(tokenXHex);
    const tokenYAddr = decodeAddress(tokenYHex);
    const binStep = Number(decodeUint256(binStepHex));
    let activeBin = decodeUint24(activeIdHex);

    const [tokenA, tokenB] = await Promise.all([
      getTokenMeta(tokenXAddr),
      getTokenMeta(tokenYAddr),
    ]);

    // Scan bins for user's liquidity
    const userBinData = await scanUserBinsInPool(poolAddress, walletAddress, activeBin, binStep, 150);

    if (userBinData.length === 0) return null;

    // Aggregate token amounts across all user bins
    let totalTokenA = 0n;
    let totalTokenB = 0n;
    const userBinIds: number[] = [];

    for (let bin of userBinData) {
      if (bin.totalLiquidity > 0n) {
        const userShare = (bin.userLiquidity * 1_000_000n) / bin.totalLiquidity;
        totalTokenA += (bin.reserveX * userShare) / 1_000_000n;
        totalTokenB += (bin.reserveY * userShare) / 1_000_000n;
      }
      userBinIds.push(bin.binId);
    }

    const lowerBin = Math.min(...userBinIds);
    const upperBin = Math.max(...userBinIds);
    const lowerPrice = priceFromBinId(lowerBin, binStep);
    const upperPrice = priceFromBinId(upperBin, binStep);
    const currentPrice = priceFromBinId(activeBin, binStep);

    const inRange = activeBin >= lowerBin && activeBin <= upperBin;
    const distToLowerPct = currentPrice > 0 ? ((currentPrice - lowerPrice) / currentPrice) * 100 : null;
    const distToUpperPct = currentPrice > 0 ? ((upperPrice - currentPrice) / currentPrice) * 100 : null;

    const fee = binStep * 0.01;

    return {
      positionId: `${poolAddress.toLowerCase()}-${walletAddress.toLowerCase()}`,
      poolAddress,
      pair: `${tokenA.symbol}/${tokenB.symbol}`,
      tokenASymbol: tokenA.symbol,
      tokenBSymbol: tokenB.symbol,
      tokenAAddress: tokenXAddr,
      tokenBAddress: tokenYAddr,
      decimalsA: tokenA.decimals,
      decimalsB: tokenB.decimals,
      fee,
      binStep,
      activeBin,
      userBins: userBinIds,
      lowerBin,
      upperBin,
      lowerPrice,
      upperPrice,
      currentPrice,
      tokenAAmount: formatTokenAmount(totalTokenA, tokenA.decimals),
      tokenBAmount: formatTokenAmount(totalTokenB, tokenB.decimals),
      tokenARaw: totalTokenA.toString(),
      tokenBRaw: totalTokenB.toString(),
      currentValueUSD: null,
      unclaimedFeeA: '0',
      unclaimedFeeB: '0',
      unclaimedFeeARaw: '0',
      unclaimedFeeBRaw: '0',
      unclaimedFeeUSD: null,
      inRange,
      distToLowerPct,
      distToUpperPct,
      dataSource: 'rpc',
    };
  } catch {
    return null;
  }
}

// ─── Get all pools from indexer store (via /api/chain/pools) ─────────────────

async function getAllPoolAddresses(): Promise<string[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/chain/pools`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pools || []).map((p: { address: string }) => p.address).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  // Verify chain
  try {
    const chainIdHex = await rpcCall('eth_chainId');
    const chainId = parseInt(chainIdHex as string, 16);
    if (chainId !== CHAIN_ID) {
      return NextResponse.json(
        { error: `Wrong chain. Expected ${CHAIN_ID}, got ${chainId}` },
        { status: 502 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'RPC unreachable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }

  const positions: DLMMPosition[] = [];
  let dataSource: 'subgraph' | 'rpc' | 'none' = 'none';
  let subgraphError: string | null = null;
  let rpcFallbackUsed = false;

  // ── Step 1: Try subgraph ──────────────────────────────────────────────────
  try {
    const subgraphPositions = await fetchPositionsFromSubgraph(address);

    if (subgraphPositions.length > 0) {
      dataSource = 'subgraph';
      const built = await Promise.allSettled(
        subgraphPositions.map((sp) => buildPositionFromSubgraph(sp))
      );
      for (const r of built) {
        if (r.status === 'fulfilled' && r.value) {
          positions.push(r.value);
        }
      }
    }
  } catch (err) {
    subgraphError = err instanceof Error ? err.message : String(err);
  }

  // ── Step 2: RPC fallback — scan all known pools ───────────────────────────
  if (positions.length === 0) {
    rpcFallbackUsed = true;
    dataSource = 'rpc';

    const poolAddresses = await getAllPoolAddresses();

    if (poolAddresses.length > 0) {
      // Scan up to 20 pools to avoid timeout
      const toScan = poolAddresses.slice(0, 20);
      const results = await Promise.allSettled(
        toScan.map((poolAddr) => buildPositionFromRPC(poolAddr, address))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          positions.push(r.value);
        }
      }
    }
  }

  return NextResponse.json({
    walletAddress: address,
    chainId: CHAIN_ID,
    factoryAddress: FACTORY_ADDRESS,
    positions,
    positionCount: positions.length,
    dataSource,
    subgraphError,
    rpcFallbackUsed,
    timestamp: Date.now(),
  });
}
