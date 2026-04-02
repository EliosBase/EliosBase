import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  enforceRateLimit: vi.fn(),
  generateId: vi.fn(() => 'tx-1'),
  getSession: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  readContract: vi.fn(),
  resolveAgentWallet: vi.fn(),
  validateOrigin: vi.fn(() => null),
  verifyEscrowActionTransaction: vi.fn(),
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
    readContract: mocks.readContract,
  },
}));

vi.mock('@/lib/transactionVerification', () => ({
  verifyEscrowActionTransaction: mocks.verifyEscrowActionTransaction,
}));

vi.mock('@/lib/agentWallets', () => ({
  resolveAgentWallet: mocks.resolveAgentWallet,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: {
    walletMutation: {},
  },
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock('@/lib/contracts', () => ({
  ESCROW_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001',
  VERIFIER_ABI: [],
  VERIFIER_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000002',
}));

const { POST } = await import('@/app/api/tasks/[id]/release/route');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/tasks/task-1/release', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSupabaseBuilder(
  result: { data: unknown; error: unknown },
  options: {
    onInsert?: (payload: Record<string, unknown>) => void;
    insertResults?: Array<{ data?: unknown; error: { code?: string; message?: string } | null }>;
  } = {},
) {
  const builder: Record<string, unknown> = {};

  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn((payload: Record<string, unknown>) => {
    options.onInsert?.(payload);

    return {
      select: vi.fn(() => ({
        single: vi.fn(async () => options.insertResults?.shift() ?? { data: payload, error: null }),
      })),
    };
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

function makeCompletedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Contract audit report',
    reward: '0.25 ETH',
    status: 'completed',
    current_step: 'Complete',
    submitter_id: 'user-1',
    assigned_agent: 'agent-1',
    agents: {
      name: 'Wallet Agent',
      users: {
        wallet_address: '0xagent',
      },
    },
    ...overrides,
  };
}

describe('POST /api/tasks/[id]/release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateOrigin.mockReturnValue(null);
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.resolveAgentWallet.mockResolvedValue({
      address: '0xsafe000000000000000000000000000000000042',
      status: 'active',
      policy: {
        standard: 'safe',
        owner: '0xagent',
        policySigner: '0xpolicy',
        owners: ['0xagent', '0xpolicy'],
        threshold: 2,
        dailySpendLimitEth: '0.50',
        coSignThresholdEth: '0.25',
        timelockThresholdEth: '1.00',
        timelockSeconds: 86400,
        blockedDestinations: [],
      },
    });
  });

  it('returns 401 without an authenticated session', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await POST(makeRequest({ txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when a different user tries to release the task escrow', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-2', walletAddress: '0xabc' });
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: makeCompletedTask(), error: null }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Only the task submitter can release funds' });
  });

  it('returns 400 when the task is not complete yet', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({
            data: makeCompletedTask({ status: 'active', current_step: 'Assigned' }),
            error: null,
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Task must be completed before releasing funds' });
  });

  it('returns 400 when the on-chain proof is not verified', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.readContract.mockResolvedValue(false);
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: makeCompletedTask(), error: null }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'ZK proof has not been verified on-chain' });
  });

  it('returns 500 when proof verification status cannot be read', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.readContract.mockRejectedValue(new Error('rpc down'));
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: makeCompletedTask(), error: null }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to check ZK proof verification status' });
  });

  it('records a confirmed escrow release after a verified proof and valid transaction', async () => {
    let insertedTransaction: Record<string, unknown> | undefined;

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.readContract.mockResolvedValue(true);
    mocks.verifyEscrowActionTransaction.mockResolvedValue({ txStatus: 'confirmed', blockNumber: 42 });
    mocks.createServiceClient.mockReturnValue(
      makeSupabaseClient({
        tasks: [
          makeSupabaseBuilder({ data: makeCompletedTask(), error: null }),
        ],
        transactions: [
          makeSupabaseBuilder({ data: null, error: null }, {
            onInsert: (payload) => { insertedTransaction = payload; },
          }),
        ],
      }),
    );

    const response = await POST(makeRequest({ txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' }), { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      taskId: 'task-1',
      transactionId: 'tx-1',
      txStatus: 'confirmed',
    });
    expect(insertedTransaction).toMatchObject({
      id: 'tx-1',
      type: 'escrow_release',
      from: 'Escrow Vault',
      to: 'Wallet Agent Safe',
      amount: '0.25 ETH',
      token: 'ETH',
      status: 'confirmed',
      tx_hash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      user_id: 'user-1',
    });
    expect(mocks.verifyEscrowActionTransaction).toHaveBeenCalledWith('0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', {
      action: 'release',
      taskId: 'task-1',
      recipient: '0xsafe000000000000000000000000000000000042',
    });
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'ESCROW_RELEASE',
      actor: '0xabc',
      target: 'task-1',
      result: 'ALLOW',
    });
  });
});
