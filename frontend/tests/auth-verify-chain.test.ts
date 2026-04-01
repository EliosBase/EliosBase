import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createUserServerClient: vi.fn(),
  enforceRateLimit: vi.fn(),
  verify: vi.fn(),
  activeChainId: 8453,
  getConfiguredSiteUrl: vi.fn(),
  isProductionRuntime: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/supabase/server', () => ({
  createUserServerClient: mocks.createUserServerClient,
}));

vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: {
    authVerify: {},
  },
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('siwe', () => ({
  SiweMessage: class {
    constructor() {}
    verify = mocks.verify;
  },
}));

vi.mock('@/lib/chainConfig', () => ({
  get activeChainId() {
    return mocks.activeChainId;
  },
}));

vi.mock('@/lib/runtimeConfig', () => ({
  getConfiguredSiteUrl: () => mocks.getConfiguredSiteUrl(),
  isProductionRuntime: () => mocks.isProductionRuntime(),
}));

const { POST } = await import('@/app/api/auth/verify/route');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SIWE verify chain ID', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.activeChainId = 8453;
    mocks.getSession.mockResolvedValue({ nonce: 'test-nonce', save: vi.fn() });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.getConfiguredSiteUrl.mockReturnValue(null);
    mocks.isProductionRuntime.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the default chain ID 8453 when env is not set', async () => {
    mocks.verify.mockResolvedValue({
      data: {
        nonce: 'test-nonce',
        chainId: 8453,
        address: '0xabc',
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      },
    });
    mocks.createUserServerClient.mockReturnValue({
      from: () => ({
        upsert: () => ({
          select: () => ({
            single: () => ({ data: { id: 'u1', wallet_address: '0xabc', role: 'submitter' }, error: null }),
          }),
        }),
      }),
    });

    const res = await POST(makeRequest({ message: 'msg', signature: '0xabcdef01' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.authenticated).toBe(true);
  });

  it('rejects wrong chain ID when env is set to testnet', async () => {
    mocks.activeChainId = 84532;
    mocks.verify.mockResolvedValue({
      data: {
        nonce: 'test-nonce',
        chainId: 8453,
        address: '0xabc',
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      },
    });

    const res = await POST(makeRequest({ message: 'msg', signature: '0xabcdef01' }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain('Wrong chain');
  });

  it('accepts testnet chain ID when env is set to testnet', async () => {
    mocks.activeChainId = 84532;
    mocks.verify.mockResolvedValue({
      data: {
        nonce: 'test-nonce',
        chainId: 84532,
        address: '0xabc',
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      },
    });
    mocks.createUserServerClient.mockReturnValue({
      from: () => ({
        upsert: () => ({
          select: () => ({
            single: () => ({ data: { id: 'u1', wallet_address: '0xabc', role: 'submitter' }, error: null }),
          }),
        }),
      }),
    });

    const res = await POST(makeRequest({ message: 'msg', signature: '0xabcdef01' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.authenticated).toBe(true);
  });

  it('rejects a valid signature when the SIWE domain does not match the configured site', async () => {
    mocks.getConfiguredSiteUrl.mockReturnValue('https://eliosbase.net');
    mocks.verify.mockResolvedValue({
      data: {
        nonce: 'test-nonce',
        chainId: 8453,
        address: '0xabc',
        domain: 'evil.test',
        uri: 'https://evil.test',
      },
    });

    const res = await POST(makeRequest({ message: 'msg', signature: '0xabcdef01' }));

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: 'SIWE domain does not match the configured site domain',
    });
  });
});
