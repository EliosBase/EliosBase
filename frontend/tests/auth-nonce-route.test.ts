import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: {
    authNonce: {},
  },
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

const { GET } = await import('@/app/api/auth/nonce/route');

describe('GET /api/auth/nonce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when the rate limiter blocks the request', async () => {
    mocks.enforceRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(new NextRequest('https://eliosbase.test/api/auth/nonce'));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'Rate limit exceeded' });
  });

  it('stores a fresh nonce in the session when allowed', async () => {
    const save = vi.fn();
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue({ save });

    const response = await GET(new NextRequest('https://eliosbase.test/api/auth/nonce'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.nonce).toBe('string');
    expect(body.nonce.length).toBeGreaterThan(0);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
