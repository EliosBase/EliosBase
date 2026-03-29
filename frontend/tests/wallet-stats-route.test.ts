import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  getSession: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: mocks.getBalance,
    })),
  };
});

const { GET } = await import('@/app/api/wallet/stats/route');

describe('GET /api/wallet/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats legacy self-directed escrow releases as refunds', async () => {
    mocks.getSession.mockResolvedValue({
      userId: 'user-1',
      walletAddress: '0xabc',
    });
    mocks.getBalance.mockResolvedValue(1_000_000_000_000_000n);
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              { type: 'escrow_lock', from: '0xabc', to: 'agent-1', amount: '0.50 ETH', status: 'confirmed' },
              { type: 'escrow_release', from: '0xabc', to: '0xabc', amount: '0.20 ETH', status: 'confirmed' },
              { type: 'reward', from: 'system', to: '0xabc', amount: '2.0 ELIO', status: 'confirmed' },
            ],
            error: null,
          })),
        })),
      })),
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      balance: '0.0010 ETH',
      inEscrow: '0.30 ETH',
      inEscrowTrend: '0 active locks',
      totalEarned: '2.0 ELIO',
    });
  });
});
