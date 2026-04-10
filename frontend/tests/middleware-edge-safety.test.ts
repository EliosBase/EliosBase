import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Middleware tests — body-size limit and global edge rate limiter.
 *
 * The edge middleware does two things before any handler runs:
 *   1. Rejects API requests with Content-Length above MAX_REQUEST_BODY_BYTES
 *      (1 MiB) with a 413. Oversized payloads never hit Supabase or Anthropic.
 *   2. Applies a coarse per-IP rate limit across all /api/* routes (excluding
 *      /api/health, /api/ready, /api/cron/*). On over-limit it returns 429.
 *
 * Ordering is important: body-size check runs first so an attacker sending a
 * huge payload gets 413 before we spend a Redis call on them. Rate limit runs
 * second so admin auth failures are still capped. Admin auth runs third.
 */

const mocks = vi.hoisted(() => ({
  edgeRateLimit: vi.fn(),
  extractRequestIp: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  edgeRateLimit: mocks.edgeRateLimit,
  extractRequestIp: mocks.extractRequestIp,
  RATE_LIMITS: {
    apiGlobal: { namespace: 'api:global', limit: 600, window: '1 m' },
  },
}));

// Import after the mock is registered.
import { MAX_REQUEST_BODY_BYTES, middleware } from '@/middleware';

function makeApiRequest(params: {
  path?: string;
  method?: string;
  contentLength?: number | string | null;
  cookie?: string;
  xForwardedFor?: string;
}) {
  const headers: Record<string, string> = {};
  if (params.contentLength !== null && params.contentLength !== undefined) {
    headers['content-length'] = String(params.contentLength);
  }
  if (params.cookie) {
    headers['cookie'] = params.cookie;
  }
  if (params.xForwardedFor) {
    headers['x-forwarded-for'] = params.xForwardedFor;
  }
  return new NextRequest(`https://eliosbase.test${params.path ?? '/api/tasks'}`, {
    method: params.method ?? 'POST',
    headers,
  });
}

describe('middleware — 1MB body limit on /api/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limiter is a no-op (pass-through). Individual tests
    // override this when they want to test the 429 path.
    mocks.edgeRateLimit.mockResolvedValue(null);
    mocks.extractRequestIp.mockReturnValue('203.0.113.1');
  });

  it('rejects POST with content-length above the limit with 413', async () => {
    const res = await middleware(
      makeApiRequest({ contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
    const json = await res!.json();
    expect(json.error).toBe('Request body too large');
    expect(json.maxBytes).toBe(MAX_REQUEST_BODY_BYTES);
    expect(json.receivedBytes).toBe(MAX_REQUEST_BODY_BYTES + 1);
  });

  it('allows POST with content-length at exactly the limit', async () => {
    const res = await middleware(
      makeApiRequest({ contentLength: MAX_REQUEST_BODY_BYTES }),
    );
    // middleware falls through to NextResponse.next() — non-413 status
    expect(res?.status).not.toBe(413);
  });

  it('allows POST well below the limit', async () => {
    const res = await middleware(makeApiRequest({ contentLength: 1024 }));
    expect(res?.status).not.toBe(413);
  });

  it('allows POST with no content-length header', async () => {
    const res = await middleware(makeApiRequest({ contentLength: null }));
    expect(res?.status).not.toBe(413);
  });

  it('ignores GET requests entirely (no body)', async () => {
    const res = await middleware(
      makeApiRequest({
        method: 'GET',
        contentLength: MAX_REQUEST_BODY_BYTES + 9999,
      }),
    );
    expect(res?.status).not.toBe(413);
  });

  it('rejects oversized PUT', async () => {
    const res = await middleware(
      makeApiRequest({ method: 'PUT', contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
  });

  it('rejects oversized PATCH', async () => {
    const res = await middleware(
      makeApiRequest({ method: 'PATCH', contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
  });

  it('rejects oversized DELETE', async () => {
    const res = await middleware(
      makeApiRequest({ method: 'DELETE', contentLength: MAX_REQUEST_BODY_BYTES + 1 }),
    );
    expect(res?.status).toBe(413);
  });

  it('treats a non-numeric content-length as absent (allows)', async () => {
    const res = await middleware(
      makeApiRequest({ contentLength: 'not-a-number' }),
    );
    expect(res?.status).not.toBe(413);
  });

  it('does not apply the limit to non-API routes', async () => {
    const res = await middleware(
      makeApiRequest({
        path: '/dashboard',
        contentLength: MAX_REQUEST_BODY_BYTES + 1,
      }),
    );
    expect(res?.status).not.toBe(413);
  });

  it('still blocks /api/admin without a session cookie (body-limit path does not bypass auth)', async () => {
    const res = await middleware(
      makeApiRequest({
        path: '/api/admin/agents/ag-1/suspend',
        contentLength: 256,
      }),
    );
    expect(res?.status).toBe(401);
  });

  it('prefers 413 over 401 when an oversized body is sent to /api/admin', async () => {
    const res = await middleware(
      makeApiRequest({
        path: '/api/admin/agents/ag-1/suspend',
        contentLength: MAX_REQUEST_BODY_BYTES + 1,
      }),
    );
    expect(res?.status).toBe(413);
  });
});

describe('middleware — global edge rate limit on /api/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.edgeRateLimit.mockResolvedValue(null);
    mocks.extractRequestIp.mockReturnValue('203.0.113.1');
  });

  it('calls the rate limiter for API routes with the client IP as key', async () => {
    mocks.extractRequestIp.mockReturnValue('203.0.113.42');
    await middleware(makeApiRequest({ path: '/api/tasks', method: 'POST' }));
    expect(mocks.edgeRateLimit).toHaveBeenCalledTimes(1);
    const [policy, key] = mocks.edgeRateLimit.mock.calls[0];
    expect(policy.namespace).toBe('api:global');
    expect(key).toBe('ip:203.0.113.42');
  });

  it('returns the 429 response from the rate limiter unchanged', async () => {
    const rateLimitResponse = NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: 30 },
      { status: 429 },
    );
    rateLimitResponse.headers.set('Retry-After', '30');
    mocks.edgeRateLimit.mockResolvedValue(rateLimitResponse);

    const res = await middleware(makeApiRequest({ path: '/api/tasks', method: 'POST' }));
    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toBe('30');
  });

  it('passes through when the rate limiter returns null', async () => {
    mocks.edgeRateLimit.mockResolvedValue(null);
    const res = await middleware(
      makeApiRequest({ path: '/api/tasks', method: 'GET' }),
    );
    expect(res?.status).not.toBe(429);
  });

  it('applies rate limiting to GET requests too', async () => {
    await middleware(makeApiRequest({ path: '/api/tasks', method: 'GET' }));
    expect(mocks.edgeRateLimit).toHaveBeenCalledTimes(1);
  });

  it('bypasses rate limiting for /api/health', async () => {
    await middleware(makeApiRequest({ path: '/api/health', method: 'GET' }));
    expect(mocks.edgeRateLimit).not.toHaveBeenCalled();
  });

  it('bypasses rate limiting for /api/ready', async () => {
    await middleware(makeApiRequest({ path: '/api/ready', method: 'GET' }));
    expect(mocks.edgeRateLimit).not.toHaveBeenCalled();
  });

  it('bypasses rate limiting for /api/cron/* routes', async () => {
    await middleware(
      makeApiRequest({ path: '/api/cron/detect-timeouts', method: 'GET' }),
    );
    expect(mocks.edgeRateLimit).not.toHaveBeenCalled();
  });

  it('does not apply rate limiting to non-API routes', async () => {
    await middleware(makeApiRequest({ path: '/dashboard', method: 'GET' }));
    expect(mocks.edgeRateLimit).not.toHaveBeenCalled();
  });

  it('runs 413 body-size check BEFORE the rate limiter (saves a Redis call)', async () => {
    const res = await middleware(
      makeApiRequest({
        path: '/api/tasks',
        method: 'POST',
        contentLength: MAX_REQUEST_BODY_BYTES + 1,
      }),
    );
    expect(res?.status).toBe(413);
    expect(mocks.edgeRateLimit).not.toHaveBeenCalled();
  });

  it('runs 429 rate limit BEFORE the 401 admin auth check', async () => {
    const rateLimitResponse = NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 },
    );
    mocks.edgeRateLimit.mockResolvedValue(rateLimitResponse);

    const res = await middleware(
      makeApiRequest({
        path: '/api/admin/agents/ag-1/suspend',
        method: 'POST',
      }),
    );
    // 429 wins: attacker hammering admin endpoint without a cookie
    // should still get rate-limited rather than probing our 401 behavior.
    expect(res?.status).toBe(429);
  });

  it('falls through to 401 when rate limit passes but admin has no session', async () => {
    mocks.edgeRateLimit.mockResolvedValue(null);
    const res = await middleware(
      makeApiRequest({
        path: '/api/admin/agents/ag-1/suspend',
        method: 'POST',
      }),
    );
    expect(res?.status).toBe(401);
  });
});
