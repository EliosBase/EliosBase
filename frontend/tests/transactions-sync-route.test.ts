import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  generateId: vi.fn(() => 'tx-1'),
  getSession: vi.fn(),
  getTransactionReceipt: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  txTypeToAuditAction: vi.fn(() => 'ESCROW_LOCK'),
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
  txTypeToAuditAction: mocks.txTypeToAuditAction,
}));

vi.mock('@/lib/viemClient', () => ({
  publicClient: {
    getTransactionReceipt: mocks.getTransactionReceipt,
  },
}));

const route = await import('@/app/api/transactions/sync/route');

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/transactions/sync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('transactions sync routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.getTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 42n,
    });
    mocks.createServiceClient.mockReturnValue({
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

  it('returns 401 for unauthenticated batch sync requests', async () => {
    mocks.getSession.mockResolvedValue({});

    const response = await route.GET();

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
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: pending, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      })),
    });

    const response = await route.GET();

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
  });
});
