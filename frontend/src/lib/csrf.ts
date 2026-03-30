import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredSiteUrl, isProductionRuntime } from '@/lib/runtimeConfig';

/**
 * Validates that a mutation request originates from the expected domain.
 * Returns null if valid, or an error NextResponse if invalid.
 */
export function validateOrigin(req: NextRequest): NextResponse | null {
  if (!isProductionRuntime()) return null;

  const origin = req.headers.get('origin');
  const siteUrl = getConfiguredSiteUrl();

  if (!siteUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SITE_URL not configured' }, { status: 500 });
  }

  if (!origin) {
    return NextResponse.json({ error: 'Missing origin header' }, { status: 403 });
  }

  const expectedOrigin = new URL(siteUrl).origin;

  if (origin === expectedOrigin) return null;
  if (origin.endsWith('.vercel.app') && expectedOrigin.endsWith('.vercel.app')) {
    const projectSlug = expectedOrigin.match(/-([a-z0-9]+)\.vercel\.app$/)?.[1];
    if (projectSlug && origin.includes(projectSlug)) return null;
  }

  return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
}
