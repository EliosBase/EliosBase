import { NextRequest, NextResponse } from 'next/server';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'on',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
