import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();

  if (!session.userId) {
    return NextResponse.json({ authenticated: false });
  }

  // Sliding window: refresh cookie TTL on every authenticated read
  await session.save();

  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    walletAddress: session.walletAddress,
    chainId: session.chainId,
  });
}
