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

  it('builds Safe migration calls for the compatibility fallback without crashing', async () => {
    process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945382d7d07b8f2b6ff9d0d7f9c21d3df0d7a1';

    const {
      buildSafe7579MigrationCalls,
      buildSafe7579Policy,
      buildSessionDefinition,
    } = await import('@/lib/agentWallet7579');

    const policy = buildSafe7579Policy('0x00000000000000000000000000000000000000cc');
    const session = buildSessionDefinition({
      sessionKeyAddress: '0x00000000000000000000000000000000000000dd',
      policy,
      hookAddress: '0x00000000000000000000000000000000000000ee',
      validUntil: Math.floor(Date.now() / 1000) + 3600,
    });

    const calls = buildSafe7579MigrationCalls({
      safeAddress: '0x00000000000000000000000000000000000000aa',
      ownerWallet: '0x00000000000000000000000000000000000000cc',
      session,
      hookAddress: '0x00000000000000000000000000000000000000ee',
      guardAddress: '0x00000000000000000000000000000000000000ff',
    });

    expect(calls).toHaveLength(6);
    expect(calls.every((call) => typeof call.data === 'string' && call.data.startsWith('0x'))).toBe(true);
  });

  it('rebuilds stored migration sessions with the original validAfter timestamp', async () => {
    process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945382d7d07b8f2b6ff9d0d7f9c21d3df0d7a1';

    const {
      buildSafe7579MigrationCalls,
      buildSafe7579ModuleMetadata,
      buildSafe7579Policy,
      buildSessionDefinition,
      buildStoredSafe7579Session,
    } = await import('@/lib/agentWallet7579');

    const ownerWallet = '0x00000000000000000000000000000000000000cc';
    const hookAddress = '0x00000000000000000000000000000000000000ee';
    const safeAddress = '0x00000000000000000000000000000000000000aa';
    const policy = buildSafe7579Policy(ownerWallet);
    const validAfter = 1_774_823_286;
    const validUntil = validAfter + 3600;
    const sessionSalt = `0x${'12'.repeat(32)}` as `0x${string}`;
    const session = buildSessionDefinition({
      sessionKeyAddress: '0x00000000000000000000000000000000000000dd',
      policy,
      hookAddress,
      validAfter,
      validUntil,
      salt: sessionSalt,
    });
    const modules = buildSafe7579ModuleMetadata({
      policyManager: '0x55183D3838f61C83E0DAF2C9240e05360245a75f',
      guard: '0x5C248059762079Cb30FBc312C382d34839ccb5ba',
      hook: hookAddress,
      sessionSalt,
    });
    const rebuilt = buildStoredSafe7579Session({
      sessionKeyAddress: '0x00000000000000000000000000000000000000dd',
      sessionKeyValidAfter: validAfter,
      sessionKeyValidUntil: validUntil,
      policy,
      modules,
    });

    expect(
      buildSafe7579MigrationCalls({
        safeAddress,
        ownerWallet,
        session,
        hookAddress,
        guardAddress: '0x5C248059762079Cb30FBc312C382d34839ccb5ba',
      }),
    ).toEqual(
      buildSafe7579MigrationCalls({
        safeAddress,
        ownerWallet,
        session: rebuilt,
        hookAddress,
        guardAddress: '0x5C248059762079Cb30FBc312C382d34839ccb5ba',
      }),
    );
  });

  it('uses the stored session when rebuilding the smart sessions validator', async () => {
    process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945382d7d07b8f2b6ff9d0d7f9c21d3df0d7a1';

    const {
      buildSafe7579ModuleMetadata,
      buildSafe7579Modules,
      buildSafe7579Policy,
      buildStoredSafe7579Session,
    } = await import('@/lib/agentWallet7579');

    const ownerWallet = '0x00000000000000000000000000000000000000cc';
    const hookAddress = '0x00000000000000000000000000000000000000ee';
    const policy = buildSafe7579Policy(ownerWallet);
    const modules = buildSafe7579ModuleMetadata({
      policyManager: '0x55183D3838f61C83E0DAF2C9240e05360245a75f',
      guard: '0x5C248059762079Cb30FBc312C382d34839ccb5ba',
      hook: hookAddress,
      sessionSalt: `0x${'12'.repeat(32)}` as `0x${string}`,
    });
    const session = buildStoredSafe7579Session({
      sessionKeyAddress: '0x00000000000000000000000000000000000000dd',
      sessionKeyValidAfter: 1_774_823_286,
      sessionKeyValidUntil: 1_774_826_886,
      policy,
      modules,
    });

    const withSession = buildSafe7579Modules({
      ownerWallet,
      hookAddress,
      session,
    });
    const withoutSession = buildSafe7579Modules({
      ownerWallet,
      hookAddress,
    });

    expect(withSession.smartSessions.initData).not.toBe(withoutSession.smartSessions.initData);
  });
});
