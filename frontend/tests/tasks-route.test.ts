import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
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
  checkRateLimit: mocks.checkRateLimit,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

const { PATCH } = await import('@/app/api/tasks/[id]/route');

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/tasks/task-1', {
    method: 'PATCH',
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it('returns 401 without a session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await PATCH(makePatchRequest({ status: 'completed' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 for submitters', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', role: 'submitter' });

    const response = await PATCH(makePatchRequest({ status: 'completed' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('allows operators to update a task', async () => {
    mocks.getSession.mockResolvedValue({
      userId: 'operator-1',
      role: 'operator',
      walletAddress: '0xabc',
    });
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'task-1',
                  title: 'Proof review',
                  description: 'Review proof',
                  status: 'completed',
                  current_step: 'Complete',
                  assigned_agent: 'ag-1',
                  reward: '0.1 ETH',
                  submitted_at: '2026-03-27T12:00:00.000Z',
                  completed_at: '2026-03-27T12:30:00.000Z',
                  execution_result: null,
                  zk_proof_id: null,
                  submitter_id: 'submitter-1',
                  agents: { name: 'Sentinel' },
                },
                error: null,
              })),
            })),
          })),
        })),
      })),
    });

    const response = await PATCH(makePatchRequest({ status: 'completed' }), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'task-1',
      status: 'completed',
      currentStep: 'Complete',
    });
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'TASK_COMPLETE',
      actor: '0xabc',
      target: 'task-1',
      result: 'ALLOW',
    });
  });
});
