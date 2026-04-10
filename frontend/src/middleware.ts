import { NextRequest, NextResponse } from 'next/server';
import { edgeRateLimit, extractRequestIp, RATE_LIMITS } from '@/lib/rateLimit';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'on',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Maximum allowed request body size for API routes (1 MiB).
// Enforced at the edge so oversized payloads are rejected before hitting
// route handlers or Supabase. Applies to POST/PUT/PATCH/DELETE on /api/*.
export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Endpoints that must never be rate-limited at the edge:
// - /api/health and /api/ready are probed by uptime monitors and the
//   production-deploy workflow, and must always return fresh status.
// - /api/cron/* routes are invoked by Vercel Cron with a shared secret
//   and must not be capped by per-IP limits (Vercel cron requests all
//   come from the same small set of IPs).
const RATE_LIMIT_EXEMPT_PREFIXES = ['/api/health', '/api/ready', '/api/cron/'];

function isRateLimitExempt(pathname: string): boolean {
  for (const prefix of RATE_LIMIT_EXEMPT_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Body size limit for all API routes that can carry a body.
  //    Runs first so an attacker sending a huge payload gets 413 before
  //    we spend a Redis call on them.
  if (pathname.startsWith('/api/') && BODY_METHODS.has(req.method)) {
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json(
          {
            error: 'Request body too large',
            maxBytes: MAX_REQUEST_BODY_BYTES,
            receivedBytes: contentLength,
          },
          { status: 413 },
        );
      }
    }
  }

  // 2. Global per-IP rate limit on /api/* (safety net against volumetric
  //    abuse). Per-route business-logic limiters still apply on top of this.
  if (pathname.startsWith('/api/') && !isRateLimitExempt(pathname)) {
    const ip = extractRequestIp(req);
    const limited = await edgeRateLimit(RATE_LIMITS.apiGlobal, `ip:${ip}`);
    if (limited) return limited;
  }

  // 3. Admin API routes require a session cookie.
  if (pathname.startsWith('/api/admin')) {
    const session = req.cookies.get('eliosbase_session');
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 4. Apply security headers to all other responses.
  const res = NextResponse.next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: [
    // Match admin API routes
    '/api/admin/:path*',
    // Match all other routes for security headers (excluding static assets)
    '/((?!_next/static|_next/image|favicon.ico|circuits/).*)',
  ],
};
