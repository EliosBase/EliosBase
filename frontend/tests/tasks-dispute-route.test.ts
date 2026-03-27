import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSecurityAlert: vi.fn(),
  createServiceClient: vi.fn(),
  getSession: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  validateOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/audit', () => ({
  createSecurityAlert: mocks.createSecurityAlert,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

const { POST } = await import('@/app/api/tasks/[id]/dispute/route');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/tasks/task-1/dispute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
  });
}

function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  builder.then = undefined;
  return builder;
}

describe('POST /api/tasks/[id]/dispute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
  });

  it('returns 401 without an authenticated session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await POST(makeRequest({ reason: 'Task delivered the wrong result.' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when a different user opens the dispute', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-2', walletAddress: '0xabc' });
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'tasks') {
          return makeBuilder({
            data: { id: 'task-1', title: 'Broken task', submitter_id: 'user-1' },
            error: null,
          });
        }

        if (table === 'security_alerts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const response = await POST(makeRequest({ reason: 'Task delivered the wrong result.' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Only the task submitter can open a dispute' });
  });

  it('returns 400 for an invalid dispute reason', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });

    const response = await POST(makeRequest({ reason: 'short' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Reason is required (10-1000 chars)' });
  });

  it('creates a dispute alert for the task submitter', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.createSecurityAlert.mockResolvedValue({ id: 'alert-1', error: null });
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'tasks') {
          return makeBuilder({
            data: { id: 'task-1', title: 'Broken task', submitter_id: 'user-1' },
            error: null,
          });
        }

        if (table === 'security_alerts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const response = await POST(makeRequest({ reason: 'The task missed the requested validation and needs review.' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      alertId: 'alert-1',
      taskId: 'task-1',
      hasOpenDispute: true,
    });
    expect(mocks.createSecurityAlert).toHaveBeenCalledWith({
      severity: 'medium',
      title: 'Dispute opened for Broken task',
      description: 'The task missed the requested validation and needs review.',
      source: 'Task Dispute · task-1',
      actor: '0xabc',
    });
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'TASK_DISPUTE',
      actor: '0xabc',
      target: 'task-1',
      result: 'FLAG',
    });
  });
});
