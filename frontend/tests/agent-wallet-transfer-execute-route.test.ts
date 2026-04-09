import { NextRequest } from 'next/server';
import { getAddress } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  executeAgentWalletTransfer: vi.fn(),
  executeSafe7579SessionTransfer: vi.fn(),
  generateId: vi.fn(() => 'tx-1'),
  getSession: vi.fn(),
  insertTransactionRecord: vi.fn(),
  logActivity: vi.fn(),
  logAudit: vi.fn(),
  resolveAgentWallet: vi.fn(),
  toAgentWalletTransfer: vi.fn(),
  validateOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/audit', () => ({
  generateId: mocks.generateId,
  logActivity: mocks.logActivity,
  logAudit: mocks.logAudit,
}));

vi.mock('@/lib/agentWallets', () => ({
  executeAgentWalletTransfer: mocks.executeAgentWalletTransfer,
  resolveAgentWallet: mocks.resolveAgentWallet,
}));

vi.mock('@/lib/agentWallet7579Transfers', () => ({
  executeSafe7579SessionTransfer: mocks.executeSafe7579SessionTransfer,
}));

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock('@/lib/transactions', () => ({
  insertTransactionRecord: mocks.insertTransactionRecord,
}));

vi.mock('@/lib/transforms', () => ({
  toAgentWalletTransfer: mocks.toAgentWalletTransfer,
}));

const { POST } = await import('@/app/api/agents/[id]/wallet/transfers/[transferId]/execute/route');

const safeAddress = getAddress('0x00000000000000000000000000000000000000aa');
const destination = getAddress('0x00000000000000000000000000000000000000bb');
const ownerWallet = getAddress('0x00000000000000000000000000000000000000cc');
const policySigner = getAddress('0x00000000000000000000000000000000000000dd');
const hookAddress = getAddress('0x00000000000000000000000000000000000000ee');
const guardAddress = getAddress('0x00000000000000000000000000000000000000ff');
const policyManager = getAddress('0x0000000000000000000000000000000000000011');
const sessionKeyAddress = getAddress('0x0000000000000000000000000000000000000012');

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://eliosbase.test/api/agents/agent-1/wallet/transfers/transfer-1/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSelectBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  return builder;
}

function makeUpdateBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  return builder;
}

function makeTransactionsBuilder() {
  return {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: 'tx-1' }, error: null })),
      })),
    })),
  };
}

function makeSupabaseClient() {
  const transfer = {
    id: 'transfer-1',
    agent_id: 'agent-1',
    safe_address: safeAddress,
    destination,
    amount_eth: '0.01',
    note: 'small payout',
    status: 'approved',
    approvals_required: 1,
    approvals_received: 1,
    execution_mode: 'session',
    created_at: '2026-03-29T12:00:00.000Z',
    agents: { name: 'Wallet Agent' },
  };
  const agent = {
    id: 'agent-1',
    name: 'Wallet Agent',
    owner_id: 'user-1',
    wallet_address: safeAddress,
    wallet_status: 'ready',
    wallet_standard: 'safe7579',
    wallet_migration_state: 'migrated',
    wallet_policy: {
      standard: 'safe7579',
      owner: ownerWallet,
      policySigner,
      owners: [ownerWallet, policySigner],
      threshold: 2,
      dailySpendLimitEth: '0.50',
      autoApproveThresholdEth: '0.05',
      reviewThresholdEth: '0.25',
      timelockThresholdEth: '1.00',
      timelockSeconds: 86400,
      blockedDestinations: [],
      allowlistedContracts: [],
    },
    wallet_modules: {
      sessionSalt: '0x1234',
      hook: hookAddress,
      guard: guardAddress,
      policyManager,
    },
    session_key_address: sessionKeyAddress,
    session_key_ciphertext: 'ciphertext',
    session_key_nonce: 'nonce',
    session_key_tag: 'tag',
    session_key_expires_at: '2026-04-05T12:00:00.000Z',
    users: {
      wallet_address: ownerWallet,
    },
  };
  const executedTransfer = {
    ...transfer,
    status: 'executed',
    executed_at: '2026-03-29T12:05:00.000Z',
    executed_by: 'user-1',
    tx_hash: '0xdeadbeef',
    user_op_hash: '0xbeadfeed',
    error_message: null,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'agent_wallet_transfers') {
        if ((makeSupabaseClient as unknown as { reads?: number }).reads === undefined) {
          (makeSupabaseClient as unknown as { reads?: number }).reads = 0;
        }
        (makeSupabaseClient as unknown as { reads: number }).reads += 1;
        return (makeSupabaseClient as unknown as { reads: number }).reads === 1
          ? makeSelectBuilder({ data: transfer, error: null })
          : makeUpdateBuilder({ data: executedTransfer, error: null });
      }

      if (table === 'agents') {
        return makeSelectBuilder({ data: agent, error: null });
      }

      if (table === 'transactions') {
        return makeTransactionsBuilder();
      }

      throw new Error(`Unexpected Supabase table access: ${table}`);
    }),
  };
}

describe('POST /api/agents/[id]/wallet/transfers/[transferId]/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (makeSupabaseClient as unknown as { reads?: number }).reads = 0;
    mocks.getSession.mockResolvedValue({
      userId: 'user-1',
      walletAddress: ownerWallet,
      role: 'submitter',
    });
    mocks.resolveAgentWallet.mockResolvedValue({
      address: safeAddress,
      status: 'ready',
      policy: {
        standard: 'safe7579',
        owner: ownerWallet,
        policySigner,
        owners: [ownerWallet, policySigner],
        threshold: 2,
        dailySpendLimitEth: '0.50',
        autoApproveThresholdEth: '0.05',
        reviewThresholdEth: '0.25',
        timelockThresholdEth: '1.00',
        timelockSeconds: 86400,
        blockedDestinations: [],
        allowlistedContracts: [],
      },
    });
    mocks.executeSafe7579SessionTransfer.mockResolvedValue({
      txHash: '0xdeadbeef',
      userOpHash: '0xbeadfeed',
      blockNumber: 42,
    });
    mocks.insertTransactionRecord.mockResolvedValue({
      data: { id: 'tx-1' },
      error: null,
      storedType: 'payment',
    });
    mocks.toAgentWalletTransfer.mockImplementation((row) => ({
      id: row.id,
      agentId: row.agent_id,
      safeAddress: row.safe_address,
      destination: row.destination,
      amountEth: row.amount_eth,
      note: row.note,
      status: row.status,
      approvalsRequired: row.approvals_required,
      approvalsReceived: row.approvals_received,
      createdAt: row.created_at,
      txHash: row.tx_hash,
      userOpHash: row.user_op_hash,
    }));
  });

  it('executes a Safe7579 session transfer without requiring txData', async () => {
    mocks.createServiceClient.mockReturnValue(makeSupabaseClient());

    const response = await POST(makeRequest({}), {
      params: Promise.resolve({ id: 'agent-1', transferId: 'transfer-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.executeSafe7579SessionTransfer).toHaveBeenCalledWith(expect.objectContaining({
      safeAddress,
      destination,
      amountEth: '0.01',
      sessionKeyAddress,
    }));
    expect(mocks.executeAgentWalletTransfer).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      txHash: '0xdeadbeef',
      transfer: expect.objectContaining({
        id: 'transfer-1',
        status: 'executed',
        userOpHash: '0xbeadfeed',
      }),
    }));
  });
});
