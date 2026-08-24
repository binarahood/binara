// Backend integration point: replace these with live Robinhood Chain RPC/indexer calls

export interface Pool {
  id: string;
  pair: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  binStep: number;
  tvl: number;
  volume24h: number;
  volume1h: number;
  volume6h: number;
  volume7d: number;
  activeLiquidity: number;
  volumeToTVL: number;
  volumeToActiveLiquidity: number;
  volatility: number;
  analyticsScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  currentPrice: number;
  priceChange24h: number;
  estimatedAPR: number;
  timeInRange: number;
  status: 'active' | 'inactive';
  address: string;
  createdAt: string;
  swapCount24h: number;
  holders?: number;
}

export const mockPools: Pool[] = [
  {
    id: 'pool-001',
    pair: 'ETH/USDC',
    tokenA: 'ETH',
    tokenB: 'USDC',
    fee: 0.05,
    binStep: 5,
    tvl: 4_820_000,
    volume24h: 18_340_000,
    volume1h: 812_000,
    volume6h: 4_210_000,
    volume7d: 98_400_000,
    activeLiquidity: 3_100_000,
    volumeToTVL: 3.8,
    volumeToActiveLiquidity: 5.91,
    volatility: 2.4,
    analyticsScore: 87,
    riskLevel: 'LOW',
    currentPrice: 3241.55,
    priceChange24h: 2.14,
    estimatedAPR: 68.4,
    timeInRange: 92.3,
    status: 'active',
    address: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    createdAt: '2026-01-15',
    swapCount24h: 4821,
    holders: 1240,
  },
  {
    id: 'pool-002',
    pair: 'WBTC/ETH',
    tokenA: 'WBTC',
    tokenB: 'ETH',
    fee: 0.3,
    binStep: 10,
    tvl: 9_100_000,
    volume24h: 31_200_000,
    volume1h: 1_380_000,
    volume6h: 7_820_000,
    volume7d: 187_000_000,
    activeLiquidity: 6_400_000,
    volumeToTVL: 3.43,
    volumeToActiveLiquidity: 4.88,
    volatility: 3.1,
    analyticsScore: 91,
    riskLevel: 'LOW',
    currentPrice: 0.0531,
    priceChange24h: -0.88,
    estimatedAPR: 112.7,
    timeInRange: 88.6,
    status: 'active',
    address: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
    createdAt: '2026-01-18',
    swapCount24h: 7203,
    holders: 892,
  },
  {
    id: 'pool-003',
    pair: 'ARB/USDT',
    tokenA: 'ARB',
    tokenB: 'USDT',
    fee: 0.1,
    binStep: 15,
    tvl: 1_240_000,
    volume24h: 8_920_000,
    volume1h: 394_000,
    volume6h: 2_140_000,
    volume7d: 52_100_000,
    activeLiquidity: 780_000,
    volumeToTVL: 7.19,
    volumeToActiveLiquidity: 11.44,
    volatility: 5.8,
    analyticsScore: 79,
    riskLevel: 'MEDIUM',
    currentPrice: 1.284,
    priceChange24h: 4.31,
    estimatedAPR: 89.2,
    timeInRange: 74.1,
    status: 'active',
    address: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    createdAt: '2026-02-03',
    swapCount24h: 2914,
    holders: 567,
  },
  {
    id: 'pool-004',
    pair: 'LINK/ETH',
    tokenA: 'LINK',
    tokenB: 'ETH',
    fee: 0.3,
    binStep: 20,
    tvl: 2_180_000,
    volume24h: 5_640_000,
    volume1h: 248_000,
    volume6h: 1_380_000,
    volume7d: 31_200_000,
    activeLiquidity: 1_420_000,
    volumeToTVL: 2.59,
    volumeToActiveLiquidity: 3.97,
    volatility: 4.2,
    analyticsScore: 72,
    riskLevel: 'MEDIUM',
    currentPrice: 0.00421,
    priceChange24h: 1.67,
    estimatedAPR: 54.8,
    timeInRange: 81.2,
    status: 'active',
    address: '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e',
    createdAt: '2026-02-14',
    swapCount24h: 1876,
    holders: 423,
  },
  {
    id: 'pool-005',
    pair: 'MATIC/USDC',
    tokenA: 'MATIC',
    tokenB: 'USDC',
    fee: 0.1,
    binStep: 10,
    tvl: 3_410_000,
    volume24h: 9_870_000,
    volume1h: 437_000,
    volume6h: 2_340_000,
    volume7d: 58_400_000,
    activeLiquidity: 2_210_000,
    volumeToTVL: 2.89,
    volumeToActiveLiquidity: 4.47,
    volatility: 3.7,
    analyticsScore: 83,
    riskLevel: 'LOW',
    currentPrice: 0.8912,
    priceChange24h: -2.14,
    estimatedAPR: 76.3,
    timeInRange: 86.4,
    status: 'active',
    address: '0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
    createdAt: '2026-02-28',
    swapCount24h: 3241,
    holders: 789,
  },
  {
    id: 'pool-006',
    pair: 'OP/ETH',
    tokenA: 'OP',
    tokenB: 'ETH',
    fee: 0.3,
    binStep: 25,
    tvl: 890_000,
    volume24h: 12_400_000,
    volume1h: 548_000,
    volume6h: 3_120_000,
    volume7d: 71_000_000,
    activeLiquidity: 540_000,
    volumeToTVL: 13.93,
    volumeToActiveLiquidity: 22.96,
    volatility: 8.4,
    analyticsScore: 68,
    riskLevel: 'HIGH',
    currentPrice: 0.000542,
    priceChange24h: 9.84,
    estimatedAPR: 143.2,
    timeInRange: 62.8,
    status: 'active',
    address: '0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a',
    createdAt: '2026-03-10',
    swapCount24h: 5672,
    holders: 312,
  },
  {
    id: 'pool-007',
    pair: 'UNI/USDC',
    tokenA: 'UNI',
    tokenB: 'USDC',
    fee: 0.05,
    binStep: 5,
    tvl: 1_680_000,
    volume24h: 3_210_000,
    volume1h: 142_000,
    volume6h: 812_000,
    volume7d: 19_800_000,
    activeLiquidity: 1_120_000,
    volumeToTVL: 1.91,
    volumeToActiveLiquidity: 2.87,
    volatility: 2.9,
    analyticsScore: 74,
    riskLevel: 'LOW',
    currentPrice: 11.42,
    priceChange24h: 0.44,
    estimatedAPR: 38.2,
    timeInRange: 94.7,
    status: 'active',
    address: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
    createdAt: '2026-03-22',
    swapCount24h: 1043,
    holders: 654,
  },
  {
    id: 'pool-008',
    pair: 'PEPE/ETH',
    tokenA: 'PEPE',
    tokenB: 'ETH',
    fee: 1.0,
    binStep: 50,
    tvl: 124_000,
    volume24h: 4_810_000,
    volume1h: 213_000,
    volume6h: 1_240_000,
    volume7d: 28_700_000,
    activeLiquidity: 84_000,
    volumeToTVL: 38.79,
    volumeToActiveLiquidity: 57.26,
    volatility: 18.2,
    analyticsScore: 41,
    riskLevel: 'EXTREME',
    currentPrice: 0.00000142,
    priceChange24h: 22.47,
    estimatedAPR: 312.8,
    timeInRange: 41.3,
    status: 'active',
    address: '0x8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c',
    createdAt: '2026-04-01',
    swapCount24h: 9841,
    holders: 2180,
  },
  {
    id: 'pool-009',
    pair: 'AAVE/ETH',
    tokenA: 'AAVE',
    tokenB: 'ETH',
    fee: 0.3,
    binStep: 15,
    tvl: 5_640_000,
    volume24h: 7_120_000,
    volume1h: 316_000,
    volume6h: 1_780_000,
    volume7d: 42_100_000,
    activeLiquidity: 3_890_000,
    volumeToTVL: 1.26,
    volumeToActiveLiquidity: 1.83,
    volatility: 3.4,
    analyticsScore: 77,
    riskLevel: 'LOW',
    currentPrice: 0.0841,
    priceChange24h: -1.22,
    estimatedAPR: 46.1,
    timeInRange: 89.9,
    status: 'active',
    address: '0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d',
    createdAt: '2026-04-15',
    swapCount24h: 2341,
    holders: 567,
  },
  {
    id: 'pool-010',
    pair: 'SNX/USDT',
    tokenA: 'SNX',
    tokenB: 'USDT',
    fee: 0.3,
    binStep: 20,
    tvl: 412_000,
    volume24h: 1_840_000,
    volume1h: 81_000,
    volume6h: 462_000,
    volume7d: 11_200_000,
    activeLiquidity: 248_000,
    volumeToTVL: 4.47,
    volumeToActiveLiquidity: 7.42,
    volatility: 6.9,
    analyticsScore: 58,
    riskLevel: 'HIGH',
    currentPrice: 2.184,
    priceChange24h: -4.87,
    estimatedAPR: 61.4,
    timeInRange: 68.2,
    status: 'active',
    address: '0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9',
    createdAt: '2026-05-02',
    swapCount24h: 841,
    holders: 234,
  },
];

export interface VolumeDataPoint {
  time: string;
  volume: number;
  tvl: number;
  fees: number;
}

export const mockVolumeData: VolumeDataPoint[] = [
  { time: '00:00', volume: 2_840_000, tvl: 28_100_000, fees: 14_200 },
  { time: '02:00', volume: 1_920_000, tvl: 27_800_000, fees: 9_600 },
  { time: '04:00', volume: 1_240_000, tvl: 27_600_000, fees: 6_200 },
  { time: '06:00', volume: 1_840_000, tvl: 27_900_000, fees: 9_200 },
  { time: '08:00', volume: 4_120_000, tvl: 28_400_000, fees: 20_600 },
  { time: '10:00', volume: 6_840_000, tvl: 29_100_000, fees: 34_200 },
  { time: '12:00', volume: 8_920_000, tvl: 29_800_000, fees: 44_600 },
  { time: '14:00', volume: 12_400_000, tvl: 30_200_000, fees: 62_000 },
  { time: '16:00', volume: 9_840_000, tvl: 29_900_000, fees: 49_200 },
  { time: '18:00', volume: 7_210_000, tvl: 29_400_000, fees: 36_050 },
  { time: '20:00', volume: 5_640_000, tvl: 28_800_000, fees: 28_200 },
  { time: '22:00', volume: 4_180_000, tvl: 28_400_000, fees: 20_900 },
];

export interface ActivityItem {
  id: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity' | 'alert';
  pool: string;
  description: string;
  amount?: string;
  timestamp: string;
  txHash?: string;
}

export const mockActivity: ActivityItem[] = [
  {
    id: 'act-001',
    type: 'swap',
    pool: 'WBTC/ETH',
    description: 'Large swap detected',
    amount: '$284,000',
    timestamp: '13:32:41',
    txHash: '0x1a2b...9c0d',
  },
  {
    id: 'act-002',
    type: 'add_liquidity',
    pool: 'ETH/USDC',
    description: 'Liquidity added',
    amount: '$142,000',
    timestamp: '13:31:18',
    txHash: '0x2b3c...0d1e',
  },
  {
    id: 'act-003',
    type: 'alert',
    pool: 'OP/ETH',
    description: 'Volume spike +340% in 1h',
    timestamp: '13:30:55',
  },
  {
    id: 'act-004',
    type: 'swap',
    pool: 'ARB/USDT',
    description: 'Swap executed',
    amount: '$48,200',
    timestamp: '13:29:33',
    txHash: '0x3c4d...1e2f',
  },
  {
    id: 'act-005',
    type: 'remove_liquidity',
    pool: 'SNX/USDT',
    description: 'Liquidity withdrawn',
    amount: '$91,400',
    timestamp: '13:28:12',
    txHash: '0x4d5e...2f3a',
  },
  {
    id: 'act-006',
    type: 'swap',
    pool: 'PEPE/ETH',
    description: 'High-impact swap',
    amount: '$18,700',
    timestamp: '13:27:44',
    txHash: '0x5e6f...3a4b',
  },
  {
    id: 'act-007',
    type: 'alert',
    pool: 'PEPE/ETH',
    description: 'Extreme volatility detected',
    timestamp: '13:26:31',
  },
  {
    id: 'act-008',
    type: 'add_liquidity',
    pool: 'WBTC/ETH',
    description: 'Large LP position opened',
    amount: '$380,000',
    timestamp: '13:25:09',
    txHash: '0x6f7a...4b5c',
  },
];

export interface PriceCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const mockPriceCandles: PriceCandle[] = [
  { time: '08:00', open: 3180.4, high: 3198.2, low: 3171.1, close: 3191.8, volume: 4200000 },
  { time: '09:00', open: 3191.8, high: 3214.6, low: 3188.3, close: 3208.2, volume: 5800000 },
  { time: '10:00', open: 3208.2, high: 3241.9, low: 3201.4, close: 3237.5, volume: 7400000 },
  { time: '11:00', open: 3237.5, high: 3249.8, low: 3218.2, close: 3221.4, volume: 6200000 },
  { time: '12:00', open: 3221.4, high: 3238.7, low: 3209.1, close: 3231.8, volume: 8900000 },
  { time: '13:00', open: 3231.8, high: 3261.2, low: 3228.4, close: 3241.55, volume: 9100000 },
];

export interface LiquidityBin {
  id: string;
  binId: number;
  price: number;
  liquidityA: number;
  liquidityB: number;
  total: number;
  isActive: boolean;
  isInRange: boolean;
}

export const mockLiquidityBins: LiquidityBin[] = [
  { id: 'bin-001', binId: 3200, price: 3200, liquidityA: 12000, liquidityB: 38000, total: 50000, isActive: false, isInRange: false },
  { id: 'bin-002', binId: 3205, price: 3205, liquidityA: 28000, liquidityB: 84000, total: 112000, isActive: false, isInRange: false },
  { id: 'bin-003', binId: 3210, price: 3210, liquidityA: 64000, liquidityB: 190000, total: 254000, isActive: false, isInRange: true },
  { id: 'bin-004', binId: 3215, price: 3215, liquidityA: 142000, liquidityB: 420000, total: 562000, isActive: false, isInRange: true },
  { id: 'bin-005', binId: 3220, price: 3220, liquidityA: 284000, liquidityB: 840000, total: 1124000, isActive: false, isInRange: true },
  { id: 'bin-006', binId: 3225, price: 3225, liquidityA: 520000, liquidityB: 1540000, total: 2060000, isActive: false, isInRange: true },
  { id: 'bin-007', binId: 3230, price: 3230, liquidityA: 840000, liquidityB: 2480000, total: 3320000, isActive: false, isInRange: true },
  { id: 'bin-008', binId: 3235, price: 3235, liquidityA: 1240000, liquidityB: 3640000, total: 4880000, isActive: false, isInRange: true },
  { id: 'bin-009', binId: 3240, price: 3240, liquidityA: 1820000, liquidityB: 5340000, total: 7160000, isActive: false, isInRange: true },
  { id: 'bin-010', binId: 3242, price: 3241.55, liquidityA: 2100000, liquidityB: 2100000, total: 4200000, isActive: true, isInRange: true },
  { id: 'bin-011', binId: 3245, price: 3245, liquidityA: 3840000, liquidityB: 1280000, total: 5120000, isActive: false, isInRange: true },
  { id: 'bin-012', binId: 3250, price: 3250, liquidityA: 2840000, liquidityB: 840000, total: 3680000, isActive: false, isInRange: true },
  { id: 'bin-013', binId: 3255, price: 3255, liquidityA: 1840000, liquidityB: 420000, total: 2260000, isActive: false, isInRange: true },
  { id: 'bin-014', binId: 3260, price: 3260, liquidityA: 980000, liquidityB: 180000, total: 1160000, isActive: false, isInRange: true },
  { id: 'bin-015', binId: 3265, price: 3265, liquidityA: 420000, liquidityB: 64000, total: 484000, isActive: false, isInRange: false },
  { id: 'bin-016', binId: 3270, price: 3270, liquidityA: 148000, liquidityB: 18000, total: 166000, isActive: false, isInRange: false },
  { id: 'bin-017', binId: 3275, price: 3275, liquidityA: 42000, liquidityB: 4000, total: 46000, isActive: false, isInRange: false },
];

export interface ScenarioRow {
  id: string;
  label: string;
  priceChange: number;
  price: number;
  tokenAAmount: number;
  tokenBAmount: number;
  positionValue: number;
  feesEarned: number;
  hodlValue: number;
  ilPercent: number;
  inRange: boolean;
}

export function generateScenarios(
  initialCapital: number,
  currentPrice: number,
  lowerPrice: number,
  upperPrice: number,
  feeEstimate: number
): ScenarioRow[] {
  const scenarios = [
    { id: 'scen-1', label: '-90%', priceChange: -0.9 },
    { id: 'scen-2', label: '-75%', priceChange: -0.75 },
    { id: 'scen-3', label: '-50%', priceChange: -0.5 },
    { id: 'scen-4', label: '-25%', priceChange: -0.25 },
    { id: 'scen-5', label: 'Current', priceChange: 0 },
    { id: 'scen-6', label: '+25%', priceChange: 0.25 },
    { id: 'scen-7', label: '+50%', priceChange: 0.5 },
    { id: 'scen-8', label: '+100%', priceChange: 1.0 },
    { id: 'scen-9', label: '+200%', priceChange: 2.0 },
  ];

  const initialTokenA = initialCapital / 2 / currentPrice;
  const initialTokenB = initialCapital / 2;

  return scenarios.map((s) => {
    const newPrice = currentPrice * (1 + s.priceChange);
    const inRange = newPrice >= lowerPrice && newPrice <= upperPrice;
    const priceRatio = Math.sqrt(newPrice / currentPrice);

    let tokenAAmount: number;
    let tokenBAmount: number;

    if (newPrice <= lowerPrice) {
      tokenAAmount = initialTokenA * 2;
      tokenBAmount = 0;
    } else if (newPrice >= upperPrice) {
      tokenAAmount = 0;
      tokenBAmount = initialCapital;
    } else {
      tokenAAmount = initialTokenA / priceRatio;
      tokenBAmount = initialTokenB * priceRatio;
    }

    const positionValue = tokenAAmount * newPrice + tokenBAmount;
    const hodlValue = initialTokenA * newPrice + initialTokenB;
    const ilPercent = ((positionValue - hodlValue) / hodlValue) * 100;
    const feesEarned = inRange ? feeEstimate * (1 + s.priceChange * 0.3) : feeEstimate * 0.1;

    return {
      ...s,
      price: newPrice,
      tokenAAmount,
      tokenBAmount,
      positionValue,
      feesEarned,
      hodlValue,
      ilPercent,
      inRange,
    };
  });
}

// ─── New Pool Scanner Data ────────────────────────────────────────────────────
// Backend integration point: replace with live Robinhood Chain pool creation events

export interface NewPool {
  id: string;
  pair: string;
  tokenA: string;
  tokenB: string;
  tokenAAddress: string;
  tokenBAddress: string;
  poolAddress: string;
  fee: number;
  binStep: number;
  createdAt: string;
  ageMinutes: number;
  tvl: number;
  volume5m: number;
  volume1h: number;
  volume24h: number;
  volumeToTVL: number;
  swapCount: number;
  holders?: number;
  lpStatus: 'locked' | 'unlocked' | 'burned';
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  priceChange1h: number;
  marketCap?: number;
  isVerified: boolean;
}

export const mockNewPools: NewPool[] = [
  {
    id: 'new-001',
    pair: 'RBNX/ETH',
    tokenA: 'RBNX',
    tokenB: 'ETH',
    tokenAAddress: '0xA1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    tokenBAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    poolAddress: '0xB1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0',
    fee: 1.0,
    binStep: 50,
    createdAt: '2026-08-21T13:12:00Z',
    ageMinutes: 34,
    tvl: 48_200,
    volume5m: 12_400,
    volume1h: 84_200,
    volume24h: 284_000,
    volumeToTVL: 5.89,
    swapCount: 312,
    holders: 87,
    lpStatus: 'locked',
    riskScore: 38,
    riskLevel: 'HIGH',
    priceChange1h: 42.8,
    marketCap: 1_240_000,
    isVerified: false,
  },
  {
    id: 'new-002',
    pair: 'RHCHAIN/USDC',
    tokenA: 'RHCHAIN',
    tokenB: 'USDC',
    tokenAAddress: '0xD2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
    tokenBAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    poolAddress: '0xE3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2',
    fee: 0.3,
    binStep: 20,
    createdAt: '2026-08-21T12:48:00Z',
    ageMinutes: 58,
    tvl: 182_000,
    volume5m: 8_400,
    volume1h: 124_000,
    volume24h: 892_000,
    volumeToTVL: 4.9,
    swapCount: 841,
    holders: 234,
    lpStatus: 'locked',
    riskScore: 52,
    riskLevel: 'MEDIUM',
    priceChange1h: 18.4,
    marketCap: 4_800_000,
    isVerified: false,
  },
  {
    id: 'new-003',
    pair: 'RBNDAO/ETH',
    tokenA: 'RBNDAO',
    tokenB: 'ETH',
    tokenAAddress: '0xF4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3',
    tokenBAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    poolAddress: '0xA5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
    fee: 0.3,
    binStep: 25,
    createdAt: '2026-08-21T12:21:00Z',
    ageMinutes: 85,
    tvl: 94_000,
    volume5m: 3_200,
    volume1h: 48_000,
    volume24h: 312_000,
    volumeToTVL: 3.32,
    swapCount: 428,
    holders: 156,
    lpStatus: 'unlocked',
    riskScore: 71,
    riskLevel: 'HIGH',
    priceChange1h: -8.2,
    marketCap: 2_100_000,
    isVerified: false,
  },
  {
    id: 'new-004',
    pair: 'Wrobin/USDT',
    tokenA: 'Wrobin',
    tokenB: 'USDT',
    tokenAAddress: '0xB6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
    tokenBAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    poolAddress: '0xC7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    fee: 0.1,
    binStep: 10,
    createdAt: '2026-08-21T11:46:00Z',
    ageMinutes: 120,
    tvl: 412_000,
    volume5m: 18_400,
    volume1h: 284_000,
    volume24h: 1_840_000,
    volumeToTVL: 4.47,
    swapCount: 1842,
    holders: 412,
    lpStatus: 'locked',
    riskScore: 44,
    riskLevel: 'MEDIUM',
    priceChange1h: 6.1,
    marketCap: 9_200_000,
    isVerified: true,
  },
  {
    id: 'new-005',
    pair: 'RHNFT/ETH',
    tokenA: 'RHNFT',
    tokenB: 'ETH',
    tokenAAddress: '0xD8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7',
    tokenBAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    poolAddress: '0xE9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
    fee: 1.0,
    binStep: 100,
    createdAt: '2026-08-21T11:12:00Z',
    ageMinutes: 154,
    tvl: 18_400,
    volume5m: 4_200,
    volume1h: 28_400,
    volume24h: 142_000,
    volumeToTVL: 7.72,
    swapCount: 284,
    holders: 48,
    lpStatus: 'burned',
    riskScore: 88,
    riskLevel: 'EXTREME',
    priceChange1h: 124.8,
    marketCap: 480_000,
    isVerified: false,
  },
  {
    id: 'new-006',
    pair: 'RHSTAKE/USDC',
    tokenA: 'RHSTAKE',
    tokenB: 'USDC',
    tokenAAddress: '0xF0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
    tokenBAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    poolAddress: '0xA1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    fee: 0.05,
    binStep: 5,
    createdAt: '2026-08-21T10:46:00Z',
    ageMinutes: 180,
    tvl: 1_240_000,
    volume5m: 42_000,
    volume1h: 484_000,
    volume24h: 3_840_000,
    volumeToTVL: 3.1,
    swapCount: 3241,
    holders: 892,
    lpStatus: 'locked',
    riskScore: 28,
    riskLevel: 'LOW',
    priceChange1h: 2.4,
    marketCap: 24_000_000,
    isVerified: true,
  },
  {
    id: 'new-007',
    pair: 'MEMEHOOD/ETH',
    tokenA: 'MEMEHOOD',
    tokenB: 'ETH',
    tokenAAddress: '0xB2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1',
    tokenBAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    poolAddress: '0xC3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
    fee: 1.0,
    binStep: 50,
    createdAt: '2026-08-21T10:12:00Z',
    ageMinutes: 214,
    tvl: 84_000,
    volume5m: 28_400,
    volume1h: 184_000,
    volume24h: 1_240_000,
    volumeToTVL: 14.76,
    swapCount: 4821,
    holders: 1240,
    lpStatus: 'unlocked',
    riskScore: 82,
    riskLevel: 'EXTREME',
    priceChange1h: 284.2,
    marketCap: 2_800_000,
    isVerified: false,
  },
  {
    id: 'new-008',
    pair: 'RHGOV/USDC',
    tokenA: 'RHGOV',
    tokenB: 'USDC',
    tokenAAddress: '0xD4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3',
    tokenBAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    poolAddress: '0xE5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4',
    fee: 0.1,
    binStep: 10,
    createdAt: '2026-08-21T09:46:00Z',
    ageMinutes: 240,
    tvl: 2_840_000,
    volume5m: 84_000,
    volume1h: 842_000,
    volume24h: 6_840_000,
    volumeToTVL: 2.41,
    swapCount: 5672,
    holders: 1840,
    lpStatus: 'locked',
    riskScore: 22,
    riskLevel: 'LOW',
    priceChange1h: 1.8,
    marketCap: 48_000_000,
    isVerified: true,
  },
  {
    id: 'new-009',
    pair: 'RHYIELD/ETH',
    tokenA: 'RHYIELD',
    tokenB: 'ETH',
    tokenAAddress: '0xF6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5',
    tokenBAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    poolAddress: '0xA7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6',
    fee: 0.3,
    binStep: 15,
    createdAt: '2026-08-21T08:46:00Z',
    ageMinutes: 300,
    tvl: 584_000,
    volume5m: 14_200,
    volume1h: 184_000,
    volume24h: 1_480_000,
    volumeToTVL: 2.53,
    swapCount: 1284,
    holders: 342,
    lpStatus: 'locked',
    riskScore: 41,
    riskLevel: 'MEDIUM',
    priceChange1h: -4.2,
    marketCap: 12_000_000,
    isVerified: false,
  },
  {
    id: 'new-010',
    pair: 'ROBINAI/USDT',
    tokenA: 'ROBINAI',
    tokenB: 'USDT',
    tokenAAddress: '0xB8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7',
    tokenBAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    poolAddress: '0xC9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8',
    fee: 0.3,
    binStep: 20,
    createdAt: '2026-08-21T07:46:00Z',
    ageMinutes: 360,
    tvl: 3_840_000,
    volume5m: 124_000,
    volume1h: 1_240_000,
    volume24h: 9_840_000,
    volumeToTVL: 2.56,
    swapCount: 8421,
    holders: 2840,
    lpStatus: 'locked',
    riskScore: 18,
    riskLevel: 'LOW',
    priceChange1h: 8.4,
    marketCap: 84_000_000,
    isVerified: true,
  },
  {
    id: 'new-011',
    pair: 'RHDEX/ETH',
    tokenA: 'RHDEX',
    tokenB: 'ETH',
    tokenAAddress: '0xD0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9',
    tokenBAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    poolAddress: '0xE1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
    fee: 0.05,
    binStep: 5,
    createdAt: '2026-08-21T06:46:00Z',
    ageMinutes: 420,
    tvl: 8_400_000,
    volume5m: 284_000,
    volume1h: 2_840_000,
    volume24h: 22_400_000,
    volumeToTVL: 2.67,
    swapCount: 14821,
    holders: 4200,
    lpStatus: 'locked',
    riskScore: 14,
    riskLevel: 'LOW',
    priceChange1h: 3.2,
    marketCap: 142_000_000,
    isVerified: true,
  },
  {
    id: 'new-012',
    pair: 'MOONRH/USDC',
    tokenA: 'MOONRH',
    tokenB: 'USDC',
    tokenAAddress: '0xF2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
    tokenBAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    poolAddress: '0xA3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    fee: 1.0,
    binStep: 100,
    createdAt: '2026-08-21T05:46:00Z',
    ageMinutes: 480,
    tvl: 28_000,
    volume5m: 8_400,
    volume1h: 84_000,
    volume24h: 484_000,
    volumeToTVL: 17.29,
    swapCount: 2841,
    holders: 184,
    lpStatus: 'burned',
    riskScore: 94,
    riskLevel: 'EXTREME',
    priceChange1h: 842.4,
    marketCap: 840_000,
    isVerified: false,
  },
];