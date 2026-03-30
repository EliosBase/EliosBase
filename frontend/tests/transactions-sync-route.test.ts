import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createUserServerClient: vi.fn(),
  enforceRateLimit: vi.fn(),
  generateId: vi.fn(() => 'tx-1'),
  getSession: vi.fn(),
  getTransactionReceipt: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  txTypeToAuditAction: vi.fn(() => 'ESCROW_LOCK'),
  verifyOnchainTransaction: vi.fn(),
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
  txTypeToAuditAction: mocks.txTypeToAuditAction,
}));

vi.mock('@/lib/transactionVerification', () => ({
  verifyOnchainTransaction: mocks.verifyOnchainTransaction,
}));

vi.mock('@/lib/viemClient', () => ({
  publicClient: {
    getTransactionReceipt: mocks.getTransactionReceipt,
  },
}));

vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: {
    transactionSyncRead: {},
    transactionSyncWrite: {},
  },
  enforceRateLimit: mocks.enforceRateLimit,
}));

const route = await import('@/app/api/transactions/sync/route');

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/transactions/sync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGetRequest() {
  return new NextRequest('https://eliosbase.test/api/transactions/sync');
}

describe('transactions sync routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(null);
  });

  it('returns 401 for unauthenticated POST requests', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await route.POST(makePostRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when required POST fields are missing', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1' });

    const response = await route.POST(makePostRequest({ type: 'escrow_lock' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing required fields: type, from, to, amount, token, txHash',
    });
  });

  it('stores a confirmed transaction with the on-chain block number', async () => {
    let insertedPayload: Record<string, unknown> | undefined;

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyOnchainTransaction.mockResolvedValue({ txStatus: 'confirmed', blockNumber: 42 });
    mocks.createUserServerClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  ...payload,
                  timestamp: '2026-03-24T12:00:00.000Z',
                },
                error: null,
              })),
            })),
          };
        }),
      })),
    });

    const response = await route.POST(makePostRequest({
      type: 'escrow_lock',
      from: '0xabc',
      to: 'agent-1',
      amount: '0.15 ETH',
      token: 'ETH',
      txHash: '0x1234',
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: 'tx-1',
      type: 'escrow_lock',
      status: 'confirmed',
      txHash: '0x1234',
    });
    expect(insertedPayload).toMatchObject({
      id: 'tx-1',
      type: 'escrow_lock',
      from: '0xabc',
      to: 'agent-1',
      amount: '0.15 ETH',
      token: 'ETH',
      status: 'confirmed',
      tx_hash: '0x1234',
      user_id: 'user-1',
      block_number: 42,
    });
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: 'ESCROW_LOCK',
      actor: '0xabc',
      target: 'tx-1',
      result: 'ALLOW',
    });
  });

  it('retries the insert without block_number when the live schema does not have that column', async () => {
    const insertPayloads: Array<Record<string, unknown>> = [];

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyOnchainTransaction.mockResolvedValue({ txStatus: 'confirmed', blockNumber: 42 });

    mocks.createUserServerClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertPayloads.push(payload);

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                if (insertPayloads.length === 1) {
                  return {
                    data: null,
                    error: {
                      code: 'PGRST204',
                      message: "Could not find the 'block_number' column of 'transactions' in the schema cache",
                    },
                  };
                }

                return {
                  data: {
                    ...payload,
                    timestamp: '2026-03-24T12:00:00.000Z',
                  },
                  error: null,
                };
              }),
            })),
          };
        }),
      })),
    });

    const response = await route.POST(makePostRequest({
      type: 'payment',
      from: '0xabc',
      to: '0xdef',
      amount: '0.000001 ETH',
      token: 'ETH',
      txHash: '0x1234',
    }));

    expect(response.status).toBe(201);
    expect(insertPayloads).toEqual([
      {
        id: 'tx-1',
        type: 'payment',
        from: '0xabc',
        to: '0xdef',
        amount: '0.000001 ETH',
        token: 'ETH',
        status: 'confirmed',
        tx_hash: '0x1234',
        user_id: 'user-1',
        block_number: 42,
      },
      {
        id: 'tx-1',
        type: 'payment',
        from: '0xabc',
        to: '0xdef',
        amount: '0.000001 ETH',
        token: 'ETH',
        status: 'confirmed',
        tx_hash: '0x1234',
        user_id: 'user-1',
      },
    ]);
  });

  it('ignores caller-supplied transaction status and persists the verified on-chain status', async () => {
    let insertedPayload: Record<string, unknown> | undefined;

    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });
    mocks.verifyOnchainTransaction.mockResolvedValue({ txStatus: 'pending', blockNumber: null });
    mocks.createUserServerClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn((payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { ...payload, timestamp: '2026-03-24T12:00:00.000Z' },
                error: null,
              })),
            })),
          };
        }),
      })),
    });

    const response = await route.POST(makePostRequest({
      type: 'payment',
      from: '0xabc',
      to: '0xdef',
      amount: '0.1 ETH',
      token: 'ETH',
      txHash: '0x1234',
      status: 'confirmed',
    }));

    expect(response.status).toBe(201);
    expect(insertedPayload?.status).toBe('pending');
  });

  it('rejects a transaction sync when the sender does not match the session wallet', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-1', walletAddress: '0xabc' });

    const response = await route.POST(makePostRequest({
      type: 'payment',
      from: '0xdef',
      to: '0x123',
      amount: '0.15 ETH',
      token: 'ETH',
      txHash: '0x1234',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Transaction sender does not match your wallet',
    });
  });

  it('returns 401 for unauthenticated batch sync requests', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await route.GET(makeGetRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('reconciles confirmed and failed pending transactions in batch sync', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const pending = [
      { id: 'tx-1', tx_hash: '0xaaa' },
      { id: 'tx-2', tx_hash: '0xbbb' },
      { id: 'tx-3', tx_hash: '0xccc' },
    ];

    mocks.getSession.mockResolvedValue({ userId: 'user-1' });
    mocks.getTransactionReceipt
      .mockResolvedValueOnce({ status: 'success', blockNumber: 10n })
      .mockResolvedValueOnce({ status: 'reverted' })
      .mockRejectedValueOnce(new Error('pending'));
    const eqUserId = vi.fn(() => ({
      order: vi.fn(async () => ({ data: pending, error: null })),
    }));
    const eqStatus = vi.fn(() => ({
      eq: eqUserId,
    }));

    mocks.createUserServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: eqStatus,
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      })),
    });

    const response = await route.GET(makeGetRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      synced: {
        confirmed: 1,
        failed: 1,
        stillPending: 1,
      },
    });
    expect(updates).toEqual([
      { status: 'confirmed', block_number: 10 },
      { status: 'failed' },
    ]);
    expect(eqStatus).toHaveBeenCalledWith('status', 'pending');
    expect(eqUserId).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('retries the batch update without block_number when the live schema is missing that column', async () => {
    const updates: Array<Record<string, unknown>> = [];

    mocks.getSession.mockResolvedValue({ userId: 'user-1' });
    mocks.getTransactionReceipt.mockResolvedValueOnce({ status: 'success', blockNumber: 10n });
    const eqUserId = vi.fn(() => ({
      order: vi.fn(async () => ({ data: [{ id: 'tx-1', tx_hash: '0xaaa' }], error: null })),
    }));
    const eqStatus = vi.fn(() => ({
      eq: eqUserId,
    }));

    mocks.createUserServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: eqStatus,
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);

          return {
            eq: vi.fn(async () => ({
              error: payload.block_number
                ? {
                    code: 'PGRST204',
                    message: "Could not find the 'block_number' column of 'transactions' in the schema cache",
                  }
                : null,
            })),
          };
        }),
      })),
    });

    const response = await route.GET(makeGetRequest());

    expect(response.status).toBe(200);
    expect(updates).toEqual([
      { status: 'confirmed', block_number: 10 },
      { status: 'confirmed' },
    ]);
    expect(eqUserId).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
