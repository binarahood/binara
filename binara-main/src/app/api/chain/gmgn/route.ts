import { NextRequest, NextResponse } from 'next/server';
import { fetchGMGNTokenInfo } from '@/lib/gmgn';

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('addresses') || '';
  const addresses = raw.split(',').map((address) => address.trim().toLowerCase()).filter(Boolean).slice(0, 40);
  if (!addresses.length) return NextResponse.json({ status: 'live', gmgnEnabled: Boolean(process.env.GMGN_API_KEY), tokens: [] });

  const tokens = await fetchGMGNTokenInfo(addresses);
  return NextResponse.json({
    status: 'live',
    gmgnEnabled: Boolean(process.env.GMGN_API_KEY),
    requested: addresses.length,
    resolved: tokens.size,
    tokens: Object.fromEntries(tokens.entries()),
    timestamp: Date.now(),
  });
}
