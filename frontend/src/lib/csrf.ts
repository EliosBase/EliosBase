import { NextRequest, NextResponse } from 'next/server';

/**
 * Validates that a mutation request originates from the expected domain.
 * Returns null if valid, or an error NextResponse if invalid.
 */
export function validateOrigin(req: NextRequest): NextResponse | null {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') return null;

  const origin = req.headers.get('origin');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // If no site URL configured, skip validation
  if (!siteUrl) return null;

  // Origin header is required for mutation requests in production
  if (!origin) {
    return NextResponse.json({ error: 'Missing origin header' }, { status: 403 });
  }

  const expectedOrigin = new URL(siteUrl).origin;
  if (origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  return null;
}
