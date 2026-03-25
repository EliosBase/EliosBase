import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentExecutionError } from '@/lib/agentExecutor';
import { AgentExecutionError } from '@/lib/agentExecutor';

const mocks = vi.hoisted(() => ({
  createSecurityAlert: vi.fn(),
  createServiceClient: vi.fn(),
  executeAgentTask: vi.fn(),
  generateTaskProof: vi.fn(),
  getSession: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  submitProofOnChain: vi.fn(),
  toTask: vi.fn((row: Record<string, unknown>) => ({
    id: row.id,
    currentStep: row.current_step,
    status: row.status,
  })),
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
  logAudit: mocks.logAudit,
  logActivity: mocks.logActivity,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock('@/lib/transforms', () => ({
  toTask: mocks.toTask,
}));

vi.mock('@/lib/agentExecutor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agentExecutor')>();
  return {
    ...actual,
    executeAgentTask: mocks.executeAgentTask,
  };
});

vi.mock('@/lib/zkProof', () => ({
  generateTaskProof: mocks.generateTaskProof,
}));

vi.mock('@/lib/proofSubmitter', () => ({
  submitProofOnChain: mocks.submitProofOnChain,
}));

const { POST } = await import('@/app/api/tasks/[id]/advance/route');

function isoSecondsAgo(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Audit payment flow',
    description: 'Inspect the release path',
    reward: '1 ETH',
    status: 'active',
    current_step: 'Assigned',
    assigned_agent: 'agent-1',
    submitter_id: 'user-1',
    submitted_at: isoSecondsAgo(7200),
    completed_at: null,
    execution_result: null,
    zk_proof_id: null,
    zk_commitment: null,
    zk_verify_tx_hash: null,
    step_changed_at: isoSecondsAgo(180),
    agents: {
      name: 'Delta',
      type: 'auditor',
      description: 'Reviews system integrity',
      capabilities: ['audit', 'proof'],
    },
    ...overrides,
  };
}

function makeExecutionResult() {
  return {
    summary: 'Execution completed',
    findings: [
      { severity: 'medium' as const, title: 'Escrow drift', description: 'Escrow metadata is stale.' },
    ],
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

function makeSupabaseBuilder(
  result: { data: unknown; error: unknown },
  options: { onUpdate?: (payload: Record<string, unknown>) => void } = {},
) {
  const builder: Record<string, unknown> = {};

  builder.select = vi.fn(() => builder);
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    options.onUpdate?.(payload);
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);

  return builder;
}

function makeSupabaseClient(queues: Record<string, Array<Record<string, unknown>>>) {
  return {
    from: vi.fn((table: string) => {
      const queue = queues[table];
      if (!queue?.length) {
        throw new Error(`Unexpected Supabase table access: ${table}`);
      }

      return queue.shift();
    }),
  };
}

function makeRequest() {
  return new NextRequest('https://eliosbase.test/api/tasks/task-1/advance', { method: 'POST' });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateOrigin.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({
    userId: 'user-1',
    walletAddress: '0xabc',
    role: 'submitter',
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/tasks/[id]/advance', () => {
  it('blocks non-retryable execution failures before another model call', async () => {
    const task = makeTask({
      execution_result: {
        status: 'failed',
        failure: {
          code: 'anthropic_not_configured',
          message: 'ANTHROPIC_API_KEY not configured',
          retryable: false,
          failedAt: isoSecondsAgo(30),
          model: 'claude-sonnet-4-20250514',
          agentType: 'auditor',
        },
      },
    });
    let terminalPayload: Record<string, unknown> | undefined;
    let agentPayload: Record<string, unknown> | undefined;

    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: task, error: null }),
          makeSupabaseBuilder({ data: null, error: null }, {
            onUpdate: (payload) => { terminalPayload = payload; },
          }),
        ],
        agents: [
          makeSupabaseBuilder({ data: null, error: null }, {
            onUpdate: (payload) => { agentPayload = payload; },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      advanced: false,
      currentStep: 'Assigned',
      retryable: false,
      reason: 'ANTHROPIC_API_KEY not configured',
      status: 'failed',
    });
    expect(mocks.executeAgentTask).not.toHaveBeenCalled();
    expect(terminalPayload).toMatchObject({
      status: 'failed',
      current_step: 'Assigned',
      execution_result: {
        status: 'failed',
        failure: {
          code: 'anthropic_not_configured',
          retryable: false,
          terminal: true,
          attempts: 1,
          maxRetries: 3,
        },
      },
    });
    expect(agentPayload).toEqual({ status: 'online' });
    expect(mocks.createSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Task execution failed permanently',
    }));
  });

  it('applies exponential backoff before retrying a transient execution failure', async () => {
    const task = makeTask({
      execution_result: {
        status: 'failed',
        failure: {
          code: 'anthropic_unavailable',
          message: 'Anthropic request failed temporarily',
          retryable: true,
          failedAt: isoSecondsAgo(30),
          model: 'claude-sonnet-4-20250514',
          agentType: 'auditor',
          attempts: 2,
          nextRetryAt: isoSecondsAgo(-90),
        },
      },
    });

    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [makeSupabaseBuilder({ data: task, error: null })],
      }),
    );

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.advanced).toBe(false);
    expect(body.currentStep).toBe('Assigned');
    expect(body.retryable).toBe(true);
    expect(body.attempts).toBe(2);
    expect(body.maxRetries).toBe(3);
    expect(String(body.reason)).toContain('Retry cooldown active');
    expect(mocks.executeAgentTask).not.toHaveBeenCalled();
  });

  it('marks a task failed and raises an alert after the retry budget is exhausted', async () => {
    const task = makeTask({
      execution_result: {
        status: 'failed',
        failure: {
          code: 'anthropic_unavailable',
          message: 'Anthropic request failed temporarily',
          retryable: true,
          failedAt: isoSecondsAgo(180),
          model: 'claude-sonnet-4-20250514',
          agentType: 'auditor',
          attempts: 2,
          nextRetryAt: isoSecondsAgo(30),
        },
      },
    });
    const claimedTask = makeTask({ current_step: 'Executing' });
    let failurePayload: Record<string, unknown> | undefined;
    let agentPayload: Record<string, unknown> | undefined;

    mocks.executeAgentTask.mockRejectedValue(new AgentExecutionError('Anthropic request failed temporarily', {
      code: 'anthropic_unavailable',
      retryable: true,
    }));
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: task, error: null }),
          makeSupabaseBuilder({ data: claimedTask, error: null }),
          makeSupabaseBuilder({ data: null, error: null }, {
            onUpdate: (payload) => { failurePayload = payload; },
          }),
        ],
        agents: [
          makeSupabaseBuilder({ data: null, error: null }, {
            onUpdate: (payload) => { agentPayload = payload; },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      advanced: false,
      currentStep: 'Assigned',
      retryable: false,
      status: 'failed',
      attempts: 3,
      maxRetries: 3,
    });
    expect(String(body.reason)).toContain('Retry budget exhausted after 3 attempts');
    expect(failurePayload).toMatchObject({
      status: 'failed',
      current_step: 'Assigned',
      execution_result: {
        status: 'failed',
        failure: {
          code: 'anthropic_unavailable',
          retryable: false,
          terminal: true,
          attempts: 3,
          maxRetries: 3,
          nextRetryAt: null,
        },
      },
    });
    expect(agentPayload).toEqual({ status: 'online' });
    expect(mocks.createSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Task execution retry budget exhausted',
    }));
  });

  it('stores a succeeded execution payload when the agent run completes', async () => {
    const task = makeTask();
    const claimedTask = makeTask({ current_step: 'Executing' });
    const executionResult = makeExecutionResult();
    let claimedPayload: Record<string, unknown> | undefined;
    let persistedPayload: Record<string, unknown> | undefined;

    mocks.executeAgentTask.mockResolvedValue(executionResult);
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: task, error: null }),
          makeSupabaseBuilder({ data: claimedTask, error: null }, {
            onUpdate: (payload) => { claimedPayload = payload; },
          }),
          makeSupabaseBuilder({
            data: {
              ...claimedTask,
              execution_result: {
                status: 'succeeded',
                completedAt: isoSecondsAgo(0),
                result: executionResult,
              },
            },
            error: null,
          }, {
            onUpdate: (payload) => { persistedPayload = payload; },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      advanced: true,
      previousStep: 'Assigned',
      currentStep: 'Executing',
    });
    expect(mocks.executeAgentTask).toHaveBeenCalledTimes(1);
    expect(claimedPayload?.execution_result).toMatchObject({
      status: 'running',
      model: 'claude-sonnet-4-20250514',
      agentType: 'auditor',
    });
    expect(persistedPayload?.execution_result).toMatchObject({
      status: 'succeeded',
      result: executionResult,
    });
  });

  it('uses the stored execution result to generate and submit the completion proof', async () => {
    const executionResult = makeExecutionResult();
    const task = makeTask({
      current_step: 'ZK Verifying',
      step_changed_at: isoSecondsAgo(120),
      execution_result: {
        status: 'succeeded',
        completedAt: isoSecondsAgo(90),
        result: executionResult,
      },
    });
    const proofResult = {
      proof: {
        pi_a: ['1', '2'],
        pi_b: [['3', '4'], ['5', '6']],
        pi_c: ['7', '8'],
      },
      publicSignals: ['9'],
      commitment: '987',
    };
    let completionPayload: Record<string, unknown> | undefined;

    mocks.generateTaskProof.mockResolvedValue(proofResult);
    mocks.submitProofOnChain.mockResolvedValue('0xproof');
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: task, error: null }),
          makeSupabaseBuilder({
            data: {
              ...task,
              current_step: 'Complete',
              status: 'completed',
              completed_at: isoSecondsAgo(0),
              zk_proof_id: '0xproof',
              zk_commitment: '987',
              zk_verify_tx_hash: '0xproof',
            },
            error: null,
          }, {
            onUpdate: (payload) => { completionPayload = payload; },
          }),
        ],
        agents: [makeSupabaseBuilder({ data: null, error: null })],
      }),
    );

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      advanced: true,
      previousStep: 'ZK Verifying',
      currentStep: 'Complete',
    });
    expect(mocks.generateTaskProof).toHaveBeenCalledWith(
      'task-1',
      'agent-1',
      expect.stringContaining('"summary":"Execution completed"'),
    );
    expect(mocks.submitProofOnChain).toHaveBeenCalledWith('task-1', proofResult);
    expect(completionPayload).toMatchObject({
      status: 'completed',
      zk_proof_id: '0xproof',
      zk_commitment: '987',
      zk_verify_tx_hash: '0xproof',
    });
  });

  it('reuses an existing verification hash instead of submitting the proof again', async () => {
    const task = makeTask({
      current_step: 'ZK Verifying',
      step_changed_at: isoSecondsAgo(120),
      completed_at: isoSecondsAgo(60),
      zk_proof_id: '0xproof',
      zk_commitment: '987',
      zk_verify_tx_hash: '0xproof',
      execution_result: {
        status: 'succeeded',
        completedAt: isoSecondsAgo(90),
        result: makeExecutionResult(),
      },
    });
    let completionPayload: Record<string, unknown> | undefined;

    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: task, error: null }),
          makeSupabaseBuilder({
            data: {
              ...task,
              current_step: 'Complete',
              status: 'completed',
            },
            error: null,
          }, {
            onUpdate: (payload) => { completionPayload = payload; },
          }),
        ],
        agents: [makeSupabaseBuilder({ data: null, error: null })],
      }),
    );

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: 'task-1' }) });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.currentStep).toBe('Complete');
    expect(mocks.generateTaskProof).not.toHaveBeenCalled();
    expect(mocks.submitProofOnChain).not.toHaveBeenCalled();
    expect(completionPayload).toMatchObject({
      status: 'completed',
      zk_proof_id: '0xproof',
      zk_commitment: '987',
      zk_verify_tx_hash: '0xproof',
    });
  });
});
