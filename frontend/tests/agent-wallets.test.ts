import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddress } from 'viem';

const mocks = vi.hoisted(() => ({
  getBytecode: vi.fn(),
}));

vi.mock('@/lib/viemClient', () => ({
  publicClient: {
    getBytecode: mocks.getBytecode,
  },
}));

const {
  buildAgentWalletPolicy,
  evaluateAgentWalletTransfer,
} = await import('@/lib/agentWallets');

describe('agent wallet policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROOF_SUBMITTER_PRIVATE_KEY = '0x59c6995e998f97a5a0044976f7d7d8a0d8f7f5d1fceee7d6d07fd3a2c4af4f29';
  });

  it('builds a 2-of-2 Safe policy for each agent owner', () => {
    const policy = buildAgentWalletPolicy('0x123400000000000000000000000000000000abcd');

    expect(policy.standard).toBe('safe');
    expect(policy.threshold).toBe(2);
    expect(policy.owners).toHaveLength(2);
    expect(policy.owner).toBe(getAddress('0x123400000000000000000000000000000000abcd'));
  });

  it('blocks transfers to protocol destinations automatically', async () => {
    const policy = buildAgentWalletPolicy('0x123400000000000000000000000000000000abcd');

    const decision = await evaluateAgentWalletTransfer({
      safeAddress: '0x9999000000000000000000000000000000009999',
      destination: '0x0000000000000000000000000000000000000000',
      amountEth: '0.05',
      policy,
      spentTodayEth: '0.00',
    });

    expect(decision.status).toBe('blocked');
    expect(decision.policyReason).toContain('blocked');
  });

  it('queues larger transfers behind the review lane', async () => {
    mocks.getBytecode.mockResolvedValue(undefined);
    const policy = buildAgentWalletPolicy('0x123400000000000000000000000000000000abcd');

    const decision = await evaluateAgentWalletTransfer({
      safeAddress: '0x9999000000000000000000000000000000009999',
      destination: '0xfeed00000000000000000000000000000000beef',
      amountEth: '0.30',
      policy,
      spentTodayEth: '0.00',
    });

    expect(decision.status).toBe('queued');
    expect(decision.approvalsRequired).toBe(2);
  });

  it('approves small EOA payouts inside the daily limit', async () => {
    mocks.getBytecode.mockResolvedValue(undefined);
    const policy = buildAgentWalletPolicy('0x123400000000000000000000000000000000abcd');

    const decision = await evaluateAgentWalletTransfer({
      safeAddress: '0x9999000000000000000000000000000000009999',
      destination: '0xfeed00000000000000000000000000000000beef',
      amountEth: '0.05',
      policy,
      spentTodayEth: '0.00',
    });

    expect(decision.status).toBe('approved');
    expect(decision.approvalsRequired).toBe(1);
  });
});
