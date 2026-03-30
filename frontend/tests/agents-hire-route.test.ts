import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createUserServerClient: vi.fn(),
  enforceRateLimit: vi.fn(),
  generateId: vi.fn(() => 'tx-1'),
  getSession: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  validateOrigin: vi.fn(() => null),
  verifyEscrowActionTransaction: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createUserServerClient: mocks.createUserServerClient,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/audit', () => ({
  generateId: mocks.generateId,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/transactionVerification', () => ({
  verifyEscrowActionTransaction: mocks.verifyEscrowActionTransaction,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: {
    hireAgent: {},
  },
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('@/lib/contracts', () => ({
  ESCROW_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001',
}));

const { POST } = await import('@/app/api/agents/[id]/hire/route');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/agents/agent-1/hire', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSupabaseBuilder(
  result: { data: unknown; error: unknown },
  options: {
    onInsert?: (payload: Record<string, unknown>) => void;
    onUpdate?: (payload: Record<string, unknown>) => void;
    insertError?: unknown;
  } = {},
) {
  const builder: Record<string, unknown> = {};

  builder.select = vi.fn(() => builder);
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    options.onUpdate?.(payload);
    return builder;
  });
  builder.insert = vi.fn(async (payload: Record<string, unknown>) => {
    options.onInsert?.(payload);
    return { error: options.insertError ?? null };
  });
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
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

describe('POST /api/agents/[id]/hire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
    mocks.enforceRateLimit.mockResolvedValue(null);
  });

  it('returns 401 without an authenticated session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await POST(makeRequest({ txHash: '0x1234' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when txHash is invalid', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });

    const response = await POST(makeRequest({ txHash: 'bad-hash' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Valid txHash is required' });
  });

  it('rejects transactions sent to the wrong contract', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyEscrowActionTransaction.mockRejectedValue(new Error('Transaction is not to the escrow contract'));
    mocks.createUserServerClient.mockReturnValue(
      makeSupabaseClient({
        agents: [
          makeSupabaseBuilder({
            data: { id: 'agent-1', name: 'Audit Sentinel', status: 'online', price_per_task: '0.12 ETH' },
            error: null,
          }),
        ],
        tasks: [
          makeSupabaseBuilder({
            data: {
              id: 'task-1',
              status: 'active',
              assigned_agent: null,
              current_step: 'Submitted',
              step_changed_at: '2026-03-24T12:00:00.000Z',
            },
            error: null,
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234', taskId: 'task-1' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Transaction is not to the escrow contract' });
  });

  it('rejects transactions signed by a different wallet', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyEscrowActionTransaction.mockRejectedValue(new Error('Transaction sender does not match your wallet'));
    mocks.createUserServerClient.mockReturnValue(
      makeSupabaseClient({
        agents: [
          makeSupabaseBuilder({
            data: { id: 'agent-1', name: 'Audit Sentinel', status: 'online', price_per_task: '0.12 ETH' },
            error: null,
          }),
        ],
        tasks: [
          makeSupabaseBuilder({
            data: {
              id: 'task-1',
              status: 'active',
              assigned_agent: null,
              current_step: 'Submitted',
              step_changed_at: '2026-03-24T12:00:00.000Z',
            },
            error: null,
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234', taskId: 'task-1' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Transaction sender does not match your wallet' });
  });

  it('stores a pending hire transaction and assigns the task when the receipt is unavailable', async () => {
    let transactionPayload: Record<string, unknown> | undefined;
    let taskPayload: Record<string, unknown> | undefined;

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyEscrowActionTransaction.mockResolvedValue({ txStatus: 'pending', blockNumber: null });
    mocks.createUserServerClient.mockReturnValue(
      makeSupabaseClient({
        agents: [
          makeSupabaseBuilder({
            data: { id: 'agent-1', name: 'Audit Sentinel', status: 'online', price_per_task: '0.12 ETH' },
            error: null,
          }),
          makeSupabaseBuilder({
            data: { id: 'agent-1', status: 'busy' },
            error: null,
          }, {
            onUpdate: () => undefined,
          }),
        ],
        tasks: [
          makeSupabaseBuilder({
            data: {
              id: 'task-1',
              status: 'active',
              assigned_agent: null,
              current_step: 'Submitted',
              step_changed_at: '2026-03-24T12:00:00.000Z',
            },
            error: null,
          }),
          makeSupabaseBuilder({ data: { id: 'task-1' }, error: null }, {
            onUpdate: (payload) => { taskPayload = payload; },
          }),
        ],
        transactions: [
          makeSupabaseBuilder({ data: null, error: null }, {
            onInsert: (payload) => { transactionPayload = payload; },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234', taskId: 'task-1' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      transactionId: 'tx-1',
      txHash: '0x1234',
      txStatus: 'pending',
    });
    expect(transactionPayload).toMatchObject({
      id: 'tx-1',
      type: 'escrow_lock',
      from: '0xabc',
      to: 'agent-1',
      amount: '0.12 ETH',
      token: 'ETH',
      status: 'pending',
      tx_hash: '0x1234',
      user_id: 'user-1',
    });
    expect(taskPayload).toMatchObject({
      assigned_agent: 'agent-1',
      current_step: 'Assigned',
    });
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'AGENT_HIRE',
      actor: '0xabc',
      target: 'agent-1',
      result: 'ALLOW',
    });
  });

  it('rolls the agent back to online when the transaction record fails', async () => {
    let rollbackPayload: Record<string, unknown> | undefined;

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyEscrowActionTransaction.mockResolvedValue({ txStatus: 'confirmed', blockNumber: 42 });
    mocks.createUserServerClient.mockReturnValue(
      makeSupabaseClient({
        agents: [
          makeSupabaseBuilder({
            data: { id: 'agent-1', name: 'Audit Sentinel', status: 'online', price_per_task: '0.12 ETH' },
            error: null,
          }),
          makeSupabaseBuilder({
            data: { id: 'agent-1', status: 'busy' },
            error: null,
          }),
          makeSupabaseBuilder({ data: null, error: null }, {
            onUpdate: (payload) => { rollbackPayload = payload; },
          }),
        ],
        tasks: [
          makeSupabaseBuilder({
            data: {
              id: 'task-1',
              status: 'active',
              assigned_agent: null,
              current_step: 'Submitted',
              step_changed_at: '2026-03-24T12:00:00.000Z',
            },
            error: null,
          }),
          makeSupabaseBuilder({ data: { id: 'task-1' }, error: null }),
          makeSupabaseBuilder({ data: null, error: null }),
        ],
        transactions: [
          makeSupabaseBuilder({ data: null, error: null }, {
            insertError: { message: 'db down' },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234', taskId: 'task-1' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to record transaction' });
    expect(rollbackPayload).toEqual({ status: 'online' });
  });

  it('rejects hiring a task owned by another user', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.createUserServerClient.mockReturnValue(
      makeSupabaseClient({
        agents: [
          makeSupabaseBuilder({
            data: { id: 'agent-1', name: 'Audit Sentinel', status: 'online', price_per_task: '0.12 ETH' },
            error: null,
          }),
        ],
        tasks: [
          makeSupabaseBuilder({ data: null, error: { message: 'not found' } }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234', taskId: 'task-1' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Task not found' });
  });

  it('rejects hiring an already assigned task', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.createUserServerClient.mockReturnValue(
      makeSupabaseClient({
        agents: [
          makeSupabaseBuilder({
            data: { id: 'agent-1', name: 'Audit Sentinel', status: 'online', price_per_task: '0.12 ETH' },
            error: null,
          }),
        ],
        tasks: [
          makeSupabaseBuilder({
            data: {
              id: 'task-1',
              status: 'active',
              assigned_agent: 'agent-2',
              current_step: 'Assigned',
              step_changed_at: '2026-03-24T12:00:00.000Z',
            },
            error: null,
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234', taskId: 'task-1' }), { params: Promise.resolve({ id: 'agent-1' }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Task is already assigned' });
  });
});
