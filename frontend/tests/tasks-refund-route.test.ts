import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  generateId: vi.fn(() => 'tx-1'),
  getSession: vi.fn(),
  getTransactionReceipt: vi.fn(),
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
  generateId: mocks.generateId,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/viemClient', () => ({
  publicClient: {
    getTransactionReceipt: mocks.getTransactionReceipt,
  },
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock('@/lib/contracts', () => ({
  ESCROW_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001',
}));

const { POST } = await import('@/app/api/tasks/[id]/refund/route');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/tasks/task-1/refund', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: 'https://eliosbase.test', 'content-type': 'application/json' },
  });
}

function makeBuilder(
  result: { data: unknown; error: unknown },
  options: { onInsert?: (payload: Record<string, unknown>) => void } = {},
) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(async (payload: Record<string, unknown>) => {
    options.onInsert?.(payload);
    return { error: null };
  });
  builder.update = vi.fn(() => builder);
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

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Broken task',
    reward: '0.25 ETH',
    status: 'failed',
    submitter_id: 'user-1',
    ...overrides,
  };
}

describe('POST /api/tasks/[id]/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
  });

  it('returns 401 without an authenticated session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await POST(makeRequest({ txHash: '0x1234' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when a different user tries to refund the task escrow', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-2', walletAddress: '0xabc' });
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeBuilder({ data: makeTask(), error: null }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Only the task submitter can refund escrow' });
  });

  it('returns 400 when the task is not failed and has no open dispute', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeBuilder({ data: makeTask({ status: 'active' }), error: null }),
        ],
        security_alerts: [
          {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          },
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Task must be failed or under dispute before refunding escrow',
    });
  });

  it('records a confirmed escrow refund for the submitter', async () => {
    let insertedTransaction: Record<string, unknown> | undefined;

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.getTransactionReceipt.mockResolvedValue({
      to: '0x0000000000000000000000000000000000000001',
      from: '0xabc',
      status: 'success',
    });
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeBuilder({ data: makeTask(), error: null }),
        ],
        security_alerts: [
          {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          },
        ],
        transactions: [
          makeBuilder({ data: null, error: null }, {
            onInsert: (payload) => { insertedTransaction = payload; },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0x1234' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      taskId: 'task-1',
      transactionId: 'tx-1',
      txStatus: 'confirmed',
    });
    expect(insertedTransaction).toMatchObject({
      id: 'tx-1',
      type: 'escrow_refund',
      from: '0xabc',
      to: '0xabc',
      amount: '0.25 ETH',
      token: 'ETH',
      status: 'confirmed',
      tx_hash: '0x1234',
      user_id: 'user-1',
    });
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'ESCROW_REFUND',
      actor: '0xabc',
      target: 'task-1',
      result: 'ALLOW',
    });
  });
});
