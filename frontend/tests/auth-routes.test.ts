import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

const sessionRoute = await import('@/app/api/auth/session/route');
const logoutRoute = await import('@/app/api/auth/logout/route');

describe('auth session routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an anonymous session without refreshing the cookie', async () => {
    const save = vi.fn();
    mocks.getSession.mockResolvedValue({ save });

    const response = await sessionRoute.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
    expect(save).not.toHaveBeenCalled();
  });

  it('returns the authenticated session and refreshes the cookie TTL', async () => {
    const save = vi.fn();
    mocks.getSession.mockResolvedValue({
      userId: 'user-1',
      walletAddress: '0xabc',
      chainId: 8453,
      role: 'submitter',
      save,
    });

    const response = await sessionRoute.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      userId: 'user-1',
      walletAddress: '0xabc',
      chainId: 8453,
      role: 'submitter',
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('destroys the active session on logout', async () => {
    const destroy = vi.fn();
    mocks.getSession.mockResolvedValue({ destroy });

    const response = await logoutRoute.POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
