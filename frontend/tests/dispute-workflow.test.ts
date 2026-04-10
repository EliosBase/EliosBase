import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Dispute workflow integration test.
 *
 * Covers the end-to-end lifecycle of a task dispute:
 *   1. A task submitter opens a dispute (POST /api/tasks/[id]/dispute)
 *   2. An admin or operator resolves it with one of three resolutions
 *      (refund / release / dismiss) via POST /api/admin/disputes/[alertId]/resolve
 *   3. The resulting task status + alert state are verified.
 *
 * The test exercises both routes against shared in-memory fake tables so
 * the state changes from the open-dispute call are visible to the
 * resolve call, mirroring a real e2e without spinning up a DB.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  validateOrigin: vi.fn(() => null),
  createServiceClient: vi.fn(),
  createSecurityAlert: vi.fn(),
  logAudit: vi.fn(),
  logActivity: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: mocks.validateOrigin }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/audit', () => ({
  createSecurityAlert: mocks.createSecurityAlert,
  logAudit: mocks.logAudit,
  logActivity: mocks.logActivity,
}));
vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: { walletMutation: {} },
  enforceRateLimit: mocks.enforceRateLimit,
}));

const { POST: openDispute } = await import('@/app/api/tasks/[id]/dispute/route');
const { POST: resolveDispute } = await import('@/app/api/admin/disputes/[alertId]/resolve/route');

// ─── Shared in-memory tables (reset per test) ────────────────────
type TaskRow = {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'failed';
  current_step?: string;
  submitter_id: string;
  completed_at?: string | null;
  step_changed_at?: string | null;
};

type AlertRow = {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  resolved: boolean;
  resolution?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

let tasksTable: TaskRow[] = [];
let alertsTable: AlertRow[] = [];

function installFakeClient() {
  mocks.createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'tasks') return buildTasksBuilder();
      if (table === 'security_alerts') return buildAlertsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    },
  });
}

function buildTasksBuilder() {
  // Tiny chainable query builder covering the surface used by the routes.
  const filters: Array<(row: TaskRow) => boolean> = [];
  let selectedColumns: string | null = null;
  let mode: 'select' | 'update' | null = null;
  let updatePayload: Partial<TaskRow> = {};

  const builder: Record<string, unknown> = {};

  builder.select = (cols?: string) => {
    selectedColumns = cols ?? '*';
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
  builder.single = async () => {
    const row = tasksTable.find((r) => filters.every((fn) => fn(r)));
    if (!row) return { data: null, error: { message: 'not found' } };
    // Narrow on selectedColumns if requested
    if (selectedColumns && selectedColumns !== '*') {
      const pick: Record<string, unknown> = {};
      for (const c of selectedColumns.split(',').map((s) => s.trim())) {
        pick[c] = (row as unknown as Record<string, unknown>)[c];
      }
      return { data: pick, error: null };
    }
    return { data: row, error: null };
  };

  // Handle terminal update() path
  // When update().eq() is called without a trailing .select()/.single(),
  // we need to apply the mutation immediately on the last .eq().
  const origEq = builder.eq as (col: keyof TaskRow, value: unknown) => unknown;
  builder.eq = (col: keyof TaskRow, value: unknown) => {
    const result = origEq(col, value);
    if (mode === 'update') {
      // Apply update to all matching rows
      for (const row of tasksTable) {
        if (filters.every((fn) => fn(row))) {
          Object.assign(row, updatePayload);
        }
      }
      return Promise.resolve({ error: null }).then((r) => ({
        ...(result as Record<string, unknown>),
        ...r,
      }));
    }
    return result;
  };

  return builder;
}

function buildAlertsBuilder() {
  const filters: Array<(row: AlertRow) => boolean> = [];
  let selectedColumns: string | null = null;
  let mode: 'select' | 'update' | 'insert' | null = null;
  let updatePayload: Partial<AlertRow> = {};

  const builder: Record<string, unknown> = {};

  builder.select = (cols?: string) => {
    selectedColumns = cols ?? '*';
    mode = mode ?? 'select';
    return builder;
  };
  builder.update = (payload: Partial<AlertRow>) => {
    mode = 'update';
    updatePayload = payload;
    return builder;
  };
  builder.insert = async (payload: AlertRow) => {
    alertsTable.push({ ...payload, resolved: payload.resolved ?? false });
    return { error: null };
  };
  builder.eq = (col: keyof AlertRow, value: unknown) => {
    filters.push((row) => row[col] === value);
    if (mode === 'update') {
      for (const row of alertsTable) {
        if (filters.every((fn) => fn(row))) {
          Object.assign(row, updatePayload);
        }
      }
      return Promise.resolve({ error: null });
    }
    return builder;
  };
  builder.single = async () => {
    const row = alertsTable.find((r) => filters.every((fn) => fn(r)));
    if (!row) return { data: null, error: { message: 'not found' } };
    if (selectedColumns && selectedColumns !== '*') {
      const pick: Record<string, unknown> = {};
      for (const c of selectedColumns.split(',').map((s) => s.trim())) {
        pick[c] = (row as unknown as Record<string, unknown>)[c];
      }
      return { data: pick, error: null };
    }
    return { data: row, error: null };
  };
  // Mirror of the list-open-disputes path used by POST /api/tasks/[id]/dispute:
  //   .select('id').eq('source', x).eq('resolved', false)
  // The second eq should return a thenable resolving to { data, error }.
  const chain = builder as Record<string, unknown> & { then?: unknown };
  const filterChain = chain;
  filterChain.then = (onResolve: (v: unknown) => unknown) => {
    const rows = alertsTable.filter((r) => filters.every((fn) => fn(r)));
    return Promise.resolve({ data: rows, error: null }).then(onResolve);
  };

  return builder;
}

function makeOpenRequest(taskId: string, body: unknown) {
  return new NextRequest(`https://eliosbase.test/api/tasks/${taskId}/dispute`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
  });
}

function makeResolveRequest(alertId: string, body: unknown) {
  return new NextRequest(`https://eliosbase.test/api/admin/disputes/${alertId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
  });
}

// ─── Tests ───────────────────────────────────────────────────────
describe('dispute workflow — open → resolve', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
    mocks.enforceRateLimit.mockResolvedValue(null);

    tasksTable = [
      {
        id: 'task-1',
        title: 'Disputed research task',
        status: 'active',
        current_step: 'Executing',
        submitter_id: 'user-1',
        completed_at: null,
        step_changed_at: new Date().toISOString(),
      },
    ];
    alertsTable = [];

    installFakeClient();

    // createSecurityAlert simulates the audit helper by inserting a row
    // into the fake alerts table so the resolve route can find it later.
    mocks.createSecurityAlert.mockImplementation(async (params: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description: string;
      source: string;
    }) => {
      const id = `alert-${alertsTable.length + 1}`;
      alertsTable.push({
        id,
        severity: params.severity,
        title: params.title,
        description: params.description,
        source: params.source,
        resolved: false,
      });
      return { id, error: null };
    });
  });

  it('refund resolution: task → failed, alert → resolved with resolution=refund', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xuser' });

    const openRes = await openDispute(
      makeOpenRequest('task-1', {
        reason: 'The agent returned the wrong research output and refuses to redo it.',
      }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );
    expect(openRes.status).toBe(201);
    const opened = await openRes.json();
    expect(opened.success).toBe(true);
    expect(opened.alertId).toBe('alert-1');

    // Alert should exist in the fake store
    expect(alertsTable).toHaveLength(1);
    expect(alertsTable[0].resolved).toBe(false);
    expect(alertsTable[0].source).toBe('Task Dispute · task-1');

    // Switch to admin session and resolve
    mocks.getSession.mockResolvedValue({
      userId: 'admin-1',
      role: 'admin',
      walletAddress: '0xadmin',
    });

    const resolveRes = await resolveDispute(
      makeResolveRequest('alert-1', { resolution: 'refund', notes: 'Submitter proof valid' }),
      { params: Promise.resolve({ alertId: 'alert-1' }) }
    );
    expect(resolveRes.status).toBe(200);
    const resolved = await resolveRes.json();
    expect(resolved).toMatchObject({
      success: true,
      alertId: 'alert-1',
      taskId: 'task-1',
      resolution: 'refund',
      taskStatus: 'failed',
    });

    // Verify persisted state
    expect(tasksTable[0].status).toBe('failed');
    expect(alertsTable[0].resolved).toBe(true);
    expect(alertsTable[0].resolution).toBe('refund');
    expect(alertsTable[0].resolution_notes).toBe('Submitter proof valid');
    expect(alertsTable[0].resolved_by).toBe('0xadmin');

    // Audit trail was written for both DISPUTE_RESOLVE and ALERT_RESOLVE
    const auditActions = mocks.logAudit.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(auditActions).toContain('DISPUTE_RESOLVE');
    expect(auditActions).toContain('ALERT_RESOLVE');
  });

  it('release resolution: task → completed, alert → resolved with resolution=release', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xuser' });
    await openDispute(
      makeOpenRequest('task-1', {
        reason: 'Need operator review before I accept this output.',
      }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    mocks.getSession.mockResolvedValue({
      userId: 'admin-1',
      role: 'operator',
      walletAddress: '0xop',
    });

    const res = await resolveDispute(
      makeResolveRequest('alert-1', { resolution: 'release' }),
      { params: Promise.resolve({ alertId: 'alert-1' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resolution).toBe('release');
    expect(json.taskStatus).toBe('completed');

    expect(tasksTable[0].status).toBe('completed');
    expect(tasksTable[0].current_step).toBe('Complete');
    expect(tasksTable[0].completed_at).toBeTruthy();
    expect(alertsTable[0].resolution).toBe('release');
    expect(alertsTable[0].resolved).toBe(true);
  });

  it('dismiss resolution: task status unchanged, alert → resolved with resolution=dismiss', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xuser' });
    await openDispute(
      makeOpenRequest('task-1', {
        reason: 'Not sure if this is valid, operator please check.',
      }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    const previousStatus = tasksTable[0].status;

    mocks.getSession.mockResolvedValue({
      userId: 'admin-1',
      role: 'admin',
      walletAddress: '0xadmin',
    });

    const res = await resolveDispute(
      makeResolveRequest('alert-1', { resolution: 'dismiss', notes: 'No evidence of wrongdoing' }),
      { params: Promise.resolve({ alertId: 'alert-1' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resolution).toBe('dismiss');
    expect(json.taskStatus).toBe(previousStatus); // unchanged

    // Task unchanged
    expect(tasksTable[0].status).toBe(previousStatus);
    // Alert resolved with dismiss
    expect(alertsTable[0].resolved).toBe(true);
    expect(alertsTable[0].resolution).toBe('dismiss');
  });

  it('rejects a double-resolve with 409', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xuser' });
    await openDispute(
      makeOpenRequest('task-1', {
        reason: 'Agent cannot deliver the requested output.',
      }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    mocks.getSession.mockResolvedValue({
      userId: 'admin-1',
      role: 'admin',
      walletAddress: '0xadmin',
    });

    const first = await resolveDispute(
      makeResolveRequest('alert-1', { resolution: 'refund' }),
      { params: Promise.resolve({ alertId: 'alert-1' }) }
    );
    expect(first.status).toBe(200);

    const second = await resolveDispute(
      makeResolveRequest('alert-1', { resolution: 'release' }),
      { params: Promise.resolve({ alertId: 'alert-1' }) }
    );
    expect(second.status).toBe(409);
  });

  it('rejects resolution by a submitter (403)', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xuser' });
    await openDispute(
      makeOpenRequest('task-1', {
        reason: 'This output is incorrect and needs admin review.',
      }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    // Submitter tries to resolve their own dispute — forbidden
    mocks.getSession.mockResolvedValue({ userId: 'user-1', role: 'submitter' });

    const res = await resolveDispute(
      makeResolveRequest('alert-1', { resolution: 'refund' }),
      { params: Promise.resolve({ alertId: 'alert-1' }) }
    );
    expect(res.status).toBe(403);
  });

  it('rejects refund of an already-completed task with 400', async () => {
    tasksTable[0].status = 'completed';

    // Pre-seed an unresolved dispute directly (simulating one created earlier)
    alertsTable.push({
      id: 'alert-preexisting',
      severity: 'medium',
      title: 'Dispute opened for Disputed research task',
      description: 'anything',
      source: 'Task Dispute · task-1',
      resolved: false,
    });

    mocks.getSession.mockResolvedValue({
      userId: 'admin-1',
      role: 'admin',
      walletAddress: '0xadmin',
    });

    const res = await resolveDispute(
      makeResolveRequest('alert-preexisting', { resolution: 'refund' }),
      { params: Promise.resolve({ alertId: 'alert-preexisting' }) }
    );
    expect(res.status).toBe(400);
  });
});
