import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createServiceClient: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('siwe', () => ({
  SiweMessage: class {
    constructor() {}
    verify = mocks.verify;
  },
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
    mocks.getSession.mockResolvedValue({ nonce: 'test-nonce', save: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the default chain ID 8453 when env is not set', async () => {
    delete process.env.NEXT_PUBLIC_BASE_CHAIN_ID;
    mocks.verify.mockResolvedValue({
      data: { nonce: 'test-nonce', chainId: 8453, address: '0xabc' },
    });
    mocks.createServiceClient.mockReturnValue({
      from: () => ({
        upsert: () => ({
          select: () => ({
            single: () => ({ data: { id: 'u1', wallet_address: '0xabc', role: 'submitter' }, error: null }),
          }),
        }),
      }),
    });

    const res = await POST(makeRequest({ message: 'msg', signature: 'sig' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.authenticated).toBe(true);
  });

  it('rejects wrong chain ID when env is set to 84532 (testnet)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_CHAIN_ID', '84532');
    mocks.verify.mockResolvedValue({
      data: { nonce: 'test-nonce', chainId: 8453, address: '0xabc' },
    });

    const res = await POST(makeRequest({ message: 'msg', signature: 'sig' }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain('Wrong chain');
  });

  it('accepts testnet chain ID when env is set to 84532', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_CHAIN_ID', '84532');
    mocks.verify.mockResolvedValue({
      data: { nonce: 'test-nonce', chainId: 84532, address: '0xabc' },
    });
    mocks.createServiceClient.mockReturnValue({
      from: () => ({
        upsert: () => ({
          select: () => ({
            single: () => ({ data: { id: 'u1', wallet_address: '0xabc', role: 'submitter' }, error: null }),
          }),
        }),
      }),
    });

    const res = await POST(makeRequest({ message: 'msg', signature: 'sig' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.authenticated).toBe(true);
  });
});
