import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import {
  SAFE_7579_POLICY_MANAGER_ADDRESS,
  SAFE_7579_HOOK_ADDRESS,
  buildEnableSessionCall,
  buildRemoveSessionCall,
  buildRotateSessionKeyCall,
  buildSafe7579Policy,
  buildSessionDefinition,
  buildStoredSafe7579Session,
  getSafe7579SessionPermissionId,
} from '@/lib/agentWallet7579';
import { generateEncryptedSessionKey } from '@/lib/agentWalletSecrets';

function serializeCall(call: { to: string; value: bigint | BigInt; data: string }) {
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
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SAFE_7579_POLICY_MANAGER_ADDRESS) {
    return NextResponse.json({ error: 'Safe7579 policy manager is not configured' }, { status: 500 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, wallet_address, wallet_standard, wallet_migration_state, wallet_policy, wallet_modules, session_key_address, session_key_expires_at, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (error || !agent || !agent.wallet_address) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can rotate the session key' }, { status: 403 });
  }

  if (agent.wallet_standard !== 'safe7579' || agent.wallet_migration_state !== 'migrated') {
    return NextResponse.json({ error: 'Rotate the session key after the Safe7579 migration is complete' }, { status: 409 });
  }

  const ownerRelation = Array.isArray(agent.users) ? agent.users[0] : agent.users;
  const ownerWallet = ownerRelation?.wallet_address
    ? getAddress(ownerRelation.wallet_address)
    : (session.walletAddress ? getAddress(session.walletAddress) : null);
  if (!ownerWallet) {
    return NextResponse.json({ error: 'Owner wallet address is required to rotate the Safe7579 session key' }, { status: 409 });
  }

  const policy = agent.wallet_policy ?? buildSafe7579Policy(ownerWallet);
  const hookAddress = agent.wallet_modules?.hook ?? SAFE_7579_HOOK_ADDRESS;
  if (!hookAddress) {
    return NextResponse.json({ error: 'Safe7579 hook is not configured for this agent' }, { status: 409 });
  }

  const encryptedSession = generateEncryptedSessionKey();
  const validUntil = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const sessionDefinition = buildSessionDefinition({
    sessionKeyAddress: encryptedSession.address,
    policy,
    hookAddress: getAddress(hookAddress),
    validUntil,
  });
  const rotateCall = buildRotateSessionKeyCall({
    safeAddress: getAddress(agent.wallet_address),
    sessionKeyAddress: encryptedSession.address,
    validUntil,
  });
  const safeCalls = [];

  if (agent.session_key_address && agent.session_key_expires_at && agent.wallet_modules?.sessionSalt) {
    const currentSession = buildStoredSafe7579Session({
      sessionKeyAddress: getAddress(agent.session_key_address),
      sessionKeyValidUntil: Math.floor(new Date(agent.session_key_expires_at).getTime() / 1000),
      policy,
      modules: agent.wallet_modules,
    });
    safeCalls.push(buildRemoveSessionCall(getSafe7579SessionPermissionId(currentSession)));
  }

  safeCalls.push(buildEnableSessionCall(sessionDefinition));

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      wallet_modules: {
        ...(agent.wallet_modules ?? {}),
        sessionSalt: sessionDefinition.salt,
      },
      session_key_address: encryptedSession.address,
      session_key_ciphertext: encryptedSession.ciphertext,
      session_key_nonce: encryptedSession.nonce,
      session_key_tag: encryptedSession.tag,
      session_key_expires_at: new Date(validUntil * 1000).toISOString(),
      session_key_rotated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to persist the rotated session key' }, { status: 500 });
  }

  return NextResponse.json({
    agentId: id,
    sessionKeyAddress: encryptedSession.address,
    sessionKeyExpiresAt: new Date(validUntil * 1000).toISOString(),
    safeCalls: safeCalls.map(serializeCall),
    managerCall: serializeCall(rotateCall),
  });
}
