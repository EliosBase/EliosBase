import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for GET /api/cron/detect-timeouts.
 *
 * Verifies the timeout-detection cron:
 *   - rejects unauthorized callers when CRON_SECRET is set
 *   - ignores tasks that are still within their step timeout
 *   - marks overdue tasks as failed, releases their agent, and creates
 *     the appropriate security alert + audit trail
 *   - tolerates tasks with no step_changed_at (falls back to submitted_at)
 *   - returns an accurate summary of timed-out tasks
 */

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  createSecurityAlert: vi.fn(),
  logAudit: vi.fn(),
  logActivity: vi.fn(),
  getConfiguredCronSecret: vi.fn(),
  isProductionRuntime: vi.fn(() => false),
  timingSafeCompare: vi.fn((a: string, b: string) => a === b),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/audit', () => ({
  createSecurityAlert: mocks.createSecurityAlert,
  logAudit: mocks.logAudit,
  logActivity: mocks.logActivity,
}));
vi.mock('@/lib/runtimeConfig', () => ({
  getConfiguredCronSecret: mocks.getConfiguredCronSecret,
  isProductionRuntime: mocks.isProductionRuntime,
}));
vi.mock('@/lib/authUtils', () => ({
  timingSafeCompare: mocks.timingSafeCompare,
}));

const { GET, STEP_TIMEOUT_SECONDS } = await import('@/app/api/cron/detect-timeouts/route');

type TaskRow = {
  id: string;
  title: string;
  current_step: string;
  status: 'active' | 'failed' | 'completed';
  assigned_agent: string | null;
  step_changed_at: string | null;
  submitted_at: string;
};

type AgentRow = {
  id: string;
  status: 'online' | 'busy' | 'offline' | 'suspended';
};

let tasksTable: TaskRow[] = [];
let agentsTable: AgentRow[] = [];

function installFakeClient() {
  mocks.createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'tasks') return buildTasksBuilder();
      if (table === 'agents') return buildAgentsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    },
  });
}

function buildTasksBuilder() {
  const filters: Array<(row: TaskRow) => boolean> = [];
  let mode: 'select' | 'update' | null = null;
  let updatePayload: Partial<TaskRow> = {};

  const builder: Record<string, unknown> = {};

  builder.select = () => {
    mode = mode ?? 'select';
    return builder;
  };
  builder.update = (payload: Partial<TaskRow>) => {
    mode = 'update';
    updatePayload = payload;
    return builder;
  };
  builder.eq = (col: keyof TaskRow, value: unknown) => {
    filters.push((row) => row[col] === value);
    return builder;
  };

  // Thenable: awaiting the builder (after select/eq or update/eq/eq) resolves.
  // For select mode: returns { data: rows, error: null }.
  // For update mode: applies updates to matching rows and returns { error: null }.
  (builder as { then?: unknown }).then = (onResolve: (v: unknown) => unknown) => {
    if (mode === 'update') {
      for (const row of tasksTable) {
        if (filters.every((fn) => fn(row))) {
          Object.assign(row, updatePayload);
        }
      }
      return Promise.resolve({ error: null }).then(onResolve);
    }
    const rows = tasksTable.filter((r) => filters.every((fn) => fn(r)));
    return Promise.resolve({ data: rows, error: null }).then(onResolve);
  };

  return builder;
}

function buildAgentsBuilder() {
  const filters: Array<(row: AgentRow) => boolean> = [];
  let mode: 'update' | null = null;
  let updatePayload: Partial<AgentRow> = {};

  const builder: Record<string, unknown> = {};

  builder.update = (payload: Partial<AgentRow>) => {
    mode = 'update';
    updatePayload = payload;
    return builder;
  };
  builder.eq = (col: keyof AgentRow, value: unknown) => {
    filters.push((row) => row[col] === value);
    if (mode === 'update') {
      for (const row of agentsTable) {
        if (filters.every((fn) => fn(row))) {
          Object.assign(row, updatePayload);
        }
      }
      return Promise.resolve({ error: null });
    }
    return builder;
  };

  return builder;
}

function makeRequest(auth?: string) {
  return new NextRequest('https://eliosbase.test/api/cron/detect-timeouts', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  });
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

describe('GET /api/cron/detect-timeouts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isProductionRuntime.mockReturnValue(false);
    mocks.timingSafeCompare.mockImplementation((a: string, b: string) => a === b);
    mocks.getConfiguredCronSecret.mockReturnValue('cron-secret-123');
    tasksTable = [];
    agentsTable = [];
    installFakeClient();
  });

  it('returns 401 when authorization header is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when authorization header is wrong', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('allows unauthenticated calls when no CRON_SECRET is configured and not in prod', async () => {
    mocks.getConfiguredCronSecret.mockReturnValue(undefined);
    mocks.isProductionRuntime.mockReturnValue(false);
    tasksTable = [];
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns 500 when CRON_SECRET missing in production', async () => {
    mocks.getConfiguredCronSecret.mockReturnValue(undefined);
    mocks.isProductionRuntime.mockReturnValue(true);
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it('does not flag tasks still within their step timeout', async () => {
    tasksTable = [
      {
        id: 'task-fresh',
        title: 'Fresh task',
        status: 'active',
        current_step: 'Executing',
        assigned_agent: 'agent-1',
        step_changed_at: minutesAgo(5), // well under 30min Executing timeout
        submitted_at: minutesAgo(20),
      },
    ];
    agentsTable = [{ id: 'agent-1', status: 'busy' }];

    const res = await GET(makeRequest('Bearer cron-secret-123'));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.total).toBe(1);
    expect(json.timedOut).toBe(0);
    expect(tasksTable[0].status).toBe('active');
    expect(agentsTable[0].status).toBe('busy');
    expect(mocks.createSecurityAlert).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('fails a task that has exceeded its step timeout and releases the agent', async () => {
    const executingTimeout = STEP_TIMEOUT_SECONDS.Executing;
    expect(executingTimeout).toBeDefined();

    tasksTable = [
      {
        id: 'task-stuck',
        title: 'Stuck executing task',
        status: 'active',
        current_step: 'Executing',
        assigned_agent: 'agent-1',
        step_changed_at: minutesAgo(executingTimeout / 60 + 5), // 5min past timeout
        submitted_at: minutesAgo(120),
      },
    ];
    agentsTable = [{ id: 'agent-1', status: 'busy' }];

    const res = await GET(makeRequest('Bearer cron-secret-123'));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.total).toBe(1);
    expect(json.timedOut).toBe(1);
    expect(json.results).toHaveLength(1);
    expect(json.results[0]).toMatchObject({
      taskId: 'task-stuck',
      step: 'Executing',
      timeoutSeconds: executingTimeout,
    });
    expect(json.results[0].elapsedSeconds).toBeGreaterThan(executingTimeout);

    // Task marked failed terminally
    expect(tasksTable[0].status).toBe('failed');

    // Agent released back to online
    expect(agentsTable[0].status).toBe('online');

    // Security alert created with correct metadata
    expect(mocks.createSecurityAlert).toHaveBeenCalledTimes(1);
    const alertCall = mocks.createSecurityAlert.mock.calls[0][0] as {
      severity: string;
      title: string;
      source: string;
      actor: string;
    };
    expect(alertCall.severity).toBe('high');
    expect(alertCall.title).toBe('Task timed out');
    expect(alertCall.source).toBe('Task Timeout · task-stuck');
    expect(alertCall.actor).toBe('cron');

    // Audit + activity logs fired
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'TASK_TIMEOUT',
      actor: 'cron',
      target: 'task-stuck:Executing',
      result: 'FLAG',
    });
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
  });

  it('falls back to submitted_at when step_changed_at is null', async () => {
    // Task in 'Submitted' step with no step_changed_at and a submitted_at
    // older than the Submitted timeout (10 min).
    tasksTable = [
      {
        id: 'task-no-step-change',
        title: 'Never moved past submit',
        status: 'active',
        current_step: 'Submitted',
        assigned_agent: null,
        step_changed_at: null,
        submitted_at: minutesAgo(15),
      },
    ];
    agentsTable = [];

    const res = await GET(makeRequest('Bearer cron-secret-123'));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.timedOut).toBe(1);
    expect(tasksTable[0].status).toBe('failed');
    // No agent to release
    expect(mocks.createSecurityAlert).toHaveBeenCalledTimes(1);
  });

  it('ignores tasks in steps with no configured timeout', async () => {
    tasksTable = [
      {
        id: 'task-no-timeout-step',
        title: 'Hold step task',
        status: 'active',
        current_step: 'Hold',
        assigned_agent: 'agent-1',
        step_changed_at: minutesAgo(9999),
        submitted_at: minutesAgo(9999),
      },
    ];
    agentsTable = [{ id: 'agent-1', status: 'busy' }];

    const res = await GET(makeRequest('Bearer cron-secret-123'));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.total).toBe(1);
    expect(json.timedOut).toBe(0);
    expect(tasksTable[0].status).toBe('active');
    expect(agentsTable[0].status).toBe('busy');
    expect(mocks.createSecurityAlert).not.toHaveBeenCalled();
  });

  it('processes a batch of mixed tasks and only flags the stuck ones', async () => {
    const executingTimeout = STEP_TIMEOUT_SECONDS.Executing;
    const submittedTimeout = STEP_TIMEOUT_SECONDS.Submitted;

    tasksTable = [
      {
        id: 'task-fresh-exec',
        title: 'Fresh executing',
        status: 'active',
        current_step: 'Executing',
        assigned_agent: 'agent-1',
        step_changed_at: minutesAgo(1),
        submitted_at: minutesAgo(10),
      },
      {
        id: 'task-stuck-exec',
        title: 'Stuck executing',
        status: 'active',
        current_step: 'Executing',
        assigned_agent: 'agent-2',
        step_changed_at: minutesAgo(executingTimeout / 60 + 2),
        submitted_at: minutesAgo(60),
      },
      {
        id: 'task-stuck-submit',
        title: 'Stuck submitted',
        status: 'active',
        current_step: 'Submitted',
        assigned_agent: null,
        step_changed_at: minutesAgo(submittedTimeout / 60 + 1),
        submitted_at: minutesAgo(30),
      },
    ];
    agentsTable = [
      { id: 'agent-1', status: 'busy' },
      { id: 'agent-2', status: 'busy' },
    ];

    const res = await GET(makeRequest('Bearer cron-secret-123'));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.total).toBe(3);
    expect(json.timedOut).toBe(2);
    const flaggedIds = json.results.map((r: { taskId: string }) => r.taskId);
    expect(flaggedIds).toEqual(expect.arrayContaining(['task-stuck-exec', 'task-stuck-submit']));
    expect(flaggedIds).not.toContain('task-fresh-exec');

    // Fresh task untouched
    expect(tasksTable[0].status).toBe('active');
    expect(agentsTable[0].status).toBe('busy');

    // Stuck exec task failed + its agent released
    expect(tasksTable[1].status).toBe('failed');
    expect(agentsTable[1].status).toBe('online');

    // Stuck submit task failed
    expect(tasksTable[2].status).toBe('failed');

    // Two alerts + two audit entries
    expect(mocks.createSecurityAlert).toHaveBeenCalledTimes(2);
    expect(mocks.logAudit).toHaveBeenCalledTimes(2);
  });

  it('writes the terminal failure payload on the task', async () => {
    const executingTimeout = STEP_TIMEOUT_SECONDS.Executing;
    tasksTable = [
      {
        id: 'task-stuck',
        title: 'Stuck task',
        status: 'active',
        current_step: 'Executing',
        assigned_agent: 'agent-1',
        step_changed_at: minutesAgo(executingTimeout / 60 + 10),
        submitted_at: minutesAgo(120),
      },
    ];
    agentsTable = [{ id: 'agent-1', status: 'busy' }];

    await GET(makeRequest('Bearer cron-secret-123'));

    const row = tasksTable[0] as unknown as {
      status: string;
      execution_result: {
        status: string;
        failure: { code: string; retryable: boolean; terminal: boolean; step: string };
      };
    };
    expect(row.status).toBe('failed');
    expect(row.execution_result.status).toBe('failed');
    expect(row.execution_result.failure.code).toBe('task_step_timeout');
    expect(row.execution_result.failure.retryable).toBe(false);
    expect(row.execution_result.failure.terminal).toBe(true);
    expect(row.execution_result.failure.step).toBe('Executing');
  });
});
