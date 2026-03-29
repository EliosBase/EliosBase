import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import { buildAgentWalletPolicy, resolveAgentWallet } from '@/lib/agentWallets';
import {
  SAFE_7579_GUARD_ADDRESS,
  SAFE_7579_HOOK_ADDRESS,
  SAFE_7579_POLICY_MANAGER_ADDRESS,
  buildPolicyManagerConfigureCall,
  buildRotateSessionKeyCall,
  buildSafe7579MigrationCalls,
  buildSafe7579ModuleMetadata,
  buildSafe7579Policy,
  buildSessionDefinition,
} from '@/lib/agentWallet7579';
import { generateEncryptedSessionKey } from '@/lib/agentWalletSecrets';

function serializeCall(call: { to: string; value: bigint; data: `0x${string}` }) {
  return {
    to: call.to,
    value: call.value.toString(),
    data: call.data,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session.userId || !session.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SAFE_7579_POLICY_MANAGER_ADDRESS || !SAFE_7579_GUARD_ADDRESS || !SAFE_7579_HOOK_ADDRESS) {
    return NextResponse.json({ error: 'Safe7579 contracts are not configured on the server' }, { status: 500 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, owner_id, wallet_address, wallet_policy, wallet_status, wallet_modules, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can prepare Safe7579 migration' }, { status: 403 });
  }

  const wallet = await resolveAgentWallet(agent);
  if (!wallet) {
    return NextResponse.json({ error: 'Agent wallet is not configured' }, { status: 400 });
  }

  const ownerWallet = getAddress(session.walletAddress);
  const legacyPolicy = agent.wallet_policy ?? buildAgentWalletPolicy(ownerWallet);
  const policy = {
    ...buildSafe7579Policy(ownerWallet),
    blockedDestinations: legacyPolicy.blockedDestinations,
    allowlistedContracts: legacyPolicy.allowlistedContracts ?? [],
  };

  const encryptedSession = generateEncryptedSessionKey();
  const validUntil = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const sessionDefinition = buildSessionDefinition({
    sessionKeyAddress: encryptedSession.address,
    policy,
    hookAddress: getAddress(SAFE_7579_HOOK_ADDRESS),
    validUntil,
  });
  const modules = buildSafe7579ModuleMetadata({
    policyManager: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    guard: getAddress(SAFE_7579_GUARD_ADDRESS),
    hook: getAddress(SAFE_7579_HOOK_ADDRESS),
    sessionSalt: sessionDefinition.salt,
  });

  const safeCalls = buildSafe7579MigrationCalls({
    safeAddress: wallet.address,
    ownerWallet,
    session: sessionDefinition,
    hookAddress: getAddress(SAFE_7579_HOOK_ADDRESS),
    guardAddress: getAddress(SAFE_7579_GUARD_ADDRESS),
  });

  const managerCalls = [
    buildPolicyManagerConfigureCall({
      safeAddress: wallet.address,
      policy,
      modules,
    }),
    buildRotateSessionKeyCall({
      safeAddress: wallet.address,
      sessionKeyAddress: encryptedSession.address,
      validUntil,
    }),
  ];

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      wallet_standard: 'safe7579',
      wallet_status: 'migrating',
      wallet_migration_state: 'pending',
      wallet_policy: policy,
      wallet_modules: modules,
      session_key_address: encryptedSession.address,
      session_key_ciphertext: encryptedSession.ciphertext,
      session_key_nonce: encryptedSession.nonce,
      session_key_tag: encryptedSession.tag,
      session_key_expires_at: new Date(validUntil * 1000).toISOString(),
      session_key_rotated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to persist the Safe7579 migration payload' }, { status: 500 });
  }

  return NextResponse.json({
    agentId: id,
    safeAddress: wallet.address,
    walletStandard: 'safe7579',
    migrationState: 'pending',
    sessionKeyAddress: encryptedSession.address,
    sessionKeyExpiresAt: new Date(validUntil * 1000).toISOString(),
    modules,
    safeCalls: safeCalls.map(serializeCall),
    managerCalls: managerCalls.map(serializeCall),
  });
}
