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

const { POST } = await import('@/app/api/admin/tasks/[id]/retry/route');

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/admin/tasks/task-1/retry', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockSupabase(taskData: Record<string, unknown> | null, updateError: unknown = null) {
  const updateFn = vi.fn(() => ({
    eq: () => ({ error: updateError }),
  }));
  mocks.createServiceClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: taskData, error: taskData ? null : { message: 'not found' } }),
        }),
      }),
      update: updateFn,
    }),
  });
  return { updateFn };
}

describe('POST /api/admin/tasks/[id]/retry', () => {
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

  it('returns 404 for missing task', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0x123' });
    mockSupabase(null);
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 for completed task', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0x123' });
    mockSupabase({ id: 'task-1', status: 'completed', assigned_agent: 'ag-1', title: 'Test' });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    expect(res.status).toBe(400);
  });

  it('retries a failed task successfully', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'operator', walletAddress: '0x123' });
    mockSupabase({ id: 'task-1', status: 'failed', assigned_agent: 'ag-1', title: 'Test' });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mocks.logAudit).toHaveBeenCalled();
  });
});
