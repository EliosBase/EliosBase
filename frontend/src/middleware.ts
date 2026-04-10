import { NextRequest, NextResponse } from 'next/server';

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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Body size limit for all API routes that can carry a body.
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

  // Admin API routes require a session
  if (pathname.startsWith('/api/admin')) {
    const session = req.cookies.get('eliosbase_session');
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Apply security headers to all responses
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
