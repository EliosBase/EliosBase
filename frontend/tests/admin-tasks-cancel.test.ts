import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  validateOrigin: vi.fn(() => null),
  createServiceClient: vi.fn(),
  logAudit: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: mocks.validateOrigin }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit, logActivity: mocks.logActivity }));

const { POST } = await import('@/app/api/admin/tasks/[id]/cancel/route');

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/admin/tasks/task-1/cancel', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/admin/tasks/[id]/cancel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 without session', async () => {
    mocks.getSession.mockResolvedValue({});
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for submitter role', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'submitter' });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    expect(res.status).toBe(403);
  });

  it('cancels an active task and releases agent', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0x123' });
    const agentUpdate = vi.fn(() => ({ eq: () => ({ error: null }) }));
    mocks.createServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'agents') return { update: agentUpdate };
        return {
          select: () => ({
            eq: () => ({
              single: () => ({
                data: { id: 'task-1', status: 'active', assigned_agent: 'ag-1', title: 'Test', reward: '0.5 ETH' },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => ({ error: null }) }),
        };
      },
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.refundPending).toBe(true);
    expect(agentUpdate).toHaveBeenCalled();
  });
});
