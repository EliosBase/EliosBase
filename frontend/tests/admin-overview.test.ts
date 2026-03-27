import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  validateOrigin: vi.fn(() => null),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: mocks.validateOrigin }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }));

const { GET } = await import('@/app/api/admin/overview/route');

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/admin/overview', { method: 'GET' });
}

describe('GET /api/admin/overview', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 without session', async () => {
    mocks.getSession.mockResolvedValue({});
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 for submitter role', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'submitter' });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns aggregate stats for admin', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin' });

    const mockFrom = () => ({
      select: (_sel: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            eq: () => ({ count: 3 }),
          };
        }
        return {
          order: () => ({
            limit: () => ({ data: [{ id: 1, action: 'TEST', actor: 'test', target: 'test', result: 'ALLOW' }], error: null }),
          }),
          eq: () => ({ count: 3 }),
        };
      },
    });

    mocks.createServiceClient.mockReturnValue({ from: mockFrom });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tasks).toBeDefined();
    expect(json.agents).toBeDefined();
    expect(json.openAlerts).toBeDefined();
    expect(json.recentAudit).toBeDefined();
  });
});
