import { afterEach, describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

const originalEnv = {
  proofSubmitter: process.env.PROOF_SUBMITTER_PRIVATE_KEY,
  safePolicySigner: process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY,
};

afterEach(() => {
  process.env.PROOF_SUBMITTER_PRIVATE_KEY = originalEnv.proofSubmitter;
  process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY = originalEnv.safePolicySigner;
});

describe('agentWallet7579', () => {
  it('parses sub-cent ETH policy amounts without precision loss', async () => {
    const { parseEthToPolicyUint } = await import('@/lib/agentWallet7579');

    expect(parseEthToPolicyUint('0.000003')).toBe(3_000_000_000_000n);
    expect(parseEthToPolicyUint('0.0000005')).toBe(500_000_000_000n);
  });

  it('falls back to the proof submitter key for the reviewed signer policy', async () => {
    process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY = '';
    process.env.PROOF_SUBMITTER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945382d7d07b8f2b6ff9d0d7f9c21d3df0d7a1';

    const { buildSafe7579Policy } = await import('@/lib/agentWallet7579');
    const policySigner = privateKeyToAccount(process.env.PROOF_SUBMITTER_PRIVATE_KEY as `0x${string}`).address;
    const policy = buildSafe7579Policy('0x00000000000000000000000000000000000000cc');

    expect(policy.policySigner).toBe(policySigner);
    expect(policy.owners).toEqual([
      '0x00000000000000000000000000000000000000cc',
      policySigner,
    ]);
    expect(policy.threshold).toBe(2);
  });
});
