import { NextRequest, NextResponse } from 'next/server';
import { generateNonce } from 'siwe';
import { getSession } from '@/lib/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.authNonce);
  if (rateLimitError) return rateLimitError;

  const session = await getSession();
  const nonce = generateNonce();
  session.nonce = nonce;
  await session.save();
  return NextResponse.json({ nonce });
}
