import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  getSession: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/audit', () => ({
  logAudit: mocks.logAudit,
}));

const { GET } = await import('@/app/api/tasks/[id]/result/route');

function makeRequest() {
  return new NextRequest('https://eliosbase.test/api/tasks/task-1/result');
}

function mockTaskLookup(task: Record<string, unknown> | null) {
  mocks.createServiceClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: task,
            error: task ? null : { message: 'not found' },
          })),
        })),
      })),
    })),
  });
}

function makeExecutionResult() {
  return {
    summary: 'Execution completed',
    findings: [{ severity: 'medium', title: 'Escrow drift', description: 'Escrow metadata is stale.' }],
    recommendations: ['Refresh escrow metadata before release.'],
    metadata: {
      model: 'claude-sonnet-4-20250514',
      tokensUsed: 321,
      executionTimeMs: 1234,
      agentType: 'auditor',
      capabilities: ['audit', 'proof'],
    },
  };
}

describe('GET /api/tasks/[id]/result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an authenticated session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when a non-owner non-admin requests the result', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-2', role: 'submitter' });
    mockTaskLookup({
      submitter_id: 'user-1',
      execution_result: makeExecutionResult(),
    });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 404 when a task has no stored execution result', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', role: 'submitter' });
    mockTaskLookup({
      submitter_id: 'user-1',
      execution_result: null,
    });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Task result not available' });
  });

  it('returns the stored result with no-store caching for the task owner', async () => {
    const executionResult = makeExecutionResult();

    mocks.getSession.mockResolvedValue({
      userId: 'user-1',
      role: 'submitter',
      walletAddress: '0xabc',
    });
    mockTaskLookup({
      submitter_id: 'user-1',
      execution_result: {
        status: 'succeeded',
        completedAt: '2026-03-24T12:00:00.000Z',
        result: executionResult,
      },
    });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(executionResult);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'TASK_RESULT_VIEW',
      actor: '0xabc',
      target: 'task-1',
      result: 'ALLOW',
    });
  });
});
