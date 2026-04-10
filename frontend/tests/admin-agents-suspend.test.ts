import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/lib/audit', () => ({
  logAudit: mocks.logAudit,
  logActivity: mocks.logActivity,
}));

const { POST, DELETE } = await import('@/app/api/admin/agents/[id]/suspend/route');

type TableHandler = (table: string) => unknown;

function makePostRequest(body: unknown = { reason: 'Agent produced fraudulent results repeatedly' }) {
  return new NextRequest('https://eliosbase.test/api/admin/agents/ag-1/suspend', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
  });
}

function makeDeleteRequest() {
  return new NextRequest('https://eliosbase.test/api/admin/agents/ag-1/suspend', {
    method: 'DELETE',
    headers: { origin: 'https://eliosbase.test' },
  });
}

function mockClient(handler: TableHandler) {
  mocks.createServiceClient.mockReturnValue({
    from: vi.fn(handler),
  });
}

describe('POST /api/admin/agents/[id]/suspend', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
  });

  it('returns 401 without session', async () => {
    mocks.getSession.mockResolvedValue({});
    const res = await POST(makePostRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for submitter role', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'submitter' });
    const res = await POST(makePostRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 400 for a missing or short reason', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });
    const res = await POST(makePostRequest({ reason: 'nope' }), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/at least 10/);
  });

  it('returns 404 when the agent does not exist', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });
    mockClient((table) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { message: 'not found' } }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const res = await POST(makePostRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 if the agent is already suspended', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });
    mockClient((table) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'ag-1', name: 'Rogue', status: 'suspended' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const res = await POST(makePostRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(409);
  });

  it('suspends the agent and cascades active tasks to failed', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });

    const agentUpdate = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));

    const tasksUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(async () => ({
            data: [
              { id: 'task-1', title: 'Task A', reward: '0.5 ETH' },
              { id: 'task-2', title: 'Task B', reward: '0.25 ETH' },
            ],
            error: null,
          })),
        })),
      })),
    }));

    mockClient((table) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'ag-1', name: 'Rogue', status: 'online' },
                error: null,
              }),
            }),
          }),
          update: agentUpdate,
        };
      }
      if (table === 'tasks') {
        return { update: tasksUpdate };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(makePostRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.agentId).toBe('ag-1');
    expect(json.failedTaskCount).toBe(2);
    expect(json.failedTaskIds).toEqual(['task-1', 'task-2']);

    // Agent was updated to suspended with metadata
    expect(agentUpdate).toHaveBeenCalledTimes(1);
    const agentUpdatePayload = (agentUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(agentUpdatePayload.status).toBe('suspended');
    expect(agentUpdatePayload.suspended_by).toBe('0xadmin');
    expect(typeof agentUpdatePayload.suspended_at).toBe('string');
    expect(agentUpdatePayload.suspended_reason).toMatch(/fraudulent/);

    // Tasks were updated with status failed
    expect(tasksUpdate).toHaveBeenCalledTimes(1);
    const taskUpdatePayload = (tasksUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(taskUpdatePayload.status).toBe('failed');

    // Audit + activity logs fired
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'AGENT_SUSPEND',
      actor: '0xadmin',
      target: 'ag-1',
      result: 'ALLOW',
    });
    // One suspension activity + one refund-pending activity per failed task
    expect(mocks.logActivity).toHaveBeenCalledTimes(3);
  });

  it('succeeds with zero-cascade when the agent has no active tasks', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });

    const agentUpdate = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));

    const tasksUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    }));

    mockClient((table) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'ag-1', name: 'Rogue', status: 'online' },
                error: null,
              }),
            }),
          }),
          update: agentUpdate,
        };
      }
      if (table === 'tasks') return { update: tasksUpdate };
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(makePostRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.failedTaskCount).toBe(0);
    expect(json.failedTaskIds).toEqual([]);
  });
});

describe('DELETE /api/admin/agents/[id]/suspend', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
  });

  it('returns 401 without session', async () => {
    mocks.getSession.mockResolvedValue({});
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 when agent is not suspended', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });
    mockClient((table) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'ag-1', name: 'Rogue', status: 'online' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(400);
  });

  it('unsuspends a suspended agent back to offline', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'u1', role: 'admin', walletAddress: '0xadmin' });

    const agentUpdate = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));

    mockClient((table) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'ag-1', name: 'Rogue', status: 'suspended' },
                error: null,
              }),
            }),
          }),
          update: agentUpdate,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'ag-1' }) });
    expect(res.status).toBe(200);
    const payload = (agentUpdate.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload.status).toBe('offline');
    expect(payload.suspended_at).toBeNull();
    expect(payload.suspended_reason).toBeNull();
    expect(payload.suspended_by).toBeNull();
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'AGENT_UNSUSPEND',
      actor: '0xadmin',
      target: 'ag-1',
      result: 'ALLOW',
    });
  });
});
