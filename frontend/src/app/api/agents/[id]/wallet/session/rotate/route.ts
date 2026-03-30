import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import {
  buildEnableSessionCall,
  buildRemoveSessionCall,
  buildRotateSessionKeyCall,
  getSafe7579EnableSessionDetails,
  buildSafe7579Policy,
  buildSessionDefinition,
  buildStoredSafe7579Session,
  getSafe7579SessionPermissionId,
  SAFE_7579_POLICY_MANAGER_ADDRESS,
  SAFE_7579_HOOK_ADDRESS,
} from '@/lib/agentWallet7579';
import { generateEncryptedSessionKey } from '@/lib/agentWalletSecrets';
import { prepareAgentWalletExecution } from '@/lib/agentWallets';
import { getAgentWalletMigrationState, getAgentWalletModules, getAgentWalletSession, getAgentWalletStandard } from '@/lib/agentWalletCompat';

function serializeCall(call: { to: string; value: { toString(): string }; data: string }) {
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
    .select('id, owner_id, wallet_address, wallet_policy, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (error || !agent || !agent.wallet_address) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can rotate the session key' }, { status: 403 });
  }

  if (getAgentWalletStandard(agent) !== 'safe7579' || getAgentWalletMigrationState(agent) !== 'migrated') {
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
  const modules = getAgentWalletModules(agent);
  const currentSession = getAgentWalletSession(agent);
  const hookAddress = modules?.hook ?? SAFE_7579_HOOK_ADDRESS;
  if (!hookAddress) {
    return NextResponse.json({ error: 'Safe7579 hook is not configured for this agent' }, { status: 409 });
  }

  const encryptedSession = generateEncryptedSessionKey();
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const sessionDefinition = buildSessionDefinition({
    sessionKeyAddress: encryptedSession.address,
    policy,
    hookAddress: getAddress(hookAddress),
    validAfter,
    validUntil,
  });
  const rotateCall = buildRotateSessionKeyCall({
    safeAddress: getAddress(agent.wallet_address),
    sessionKeyAddress: encryptedSession.address,
    validUntil,
  });
  const safeCalls = [];

  if (currentSession?.address && currentSession.validUntil && modules?.sessionSalt) {
    const storedSession = buildStoredSafe7579Session({
      sessionKeyAddress: getAddress(currentSession.address),
      sessionKeyValidAfter: currentSession.rotatedAt
        ? Math.floor(new Date(currentSession.rotatedAt).getTime() / 1000)
        : undefined,
      sessionKeyValidUntil: Math.floor(new Date(currentSession.validUntil).getTime() / 1000),
      policy,
      modules,
    });
    safeCalls.push(buildRemoveSessionCall(getSafe7579SessionPermissionId(storedSession)));
  }

  safeCalls.push(buildEnableSessionCall(sessionDefinition));

  const prepared = await prepareAgentWalletExecution({
    safeAddress: getAddress(agent.wallet_address),
    calls: safeCalls,
  });
  const enableSessionDetails = await getSafe7579EnableSessionDetails({
    safeAddress: getAddress(agent.wallet_address),
    session: sessionDefinition,
  });

  return NextResponse.json({
    agentId: id,
    sessionKeyAddress: encryptedSession.address,
    sessionKeyExpiresAt: new Date(validUntil * 1000).toISOString(),
    pendingSession: {
      address: encryptedSession.address,
      ciphertext: encryptedSession.ciphertext,
      nonce: encryptedSession.nonce,
      tag: encryptedSession.tag,
      validUntil: new Date(validUntil * 1000).toISOString(),
      rotatedAt: new Date(validAfter * 1000).toISOString(),
      sessionSalt: sessionDefinition.salt,
    },
    safeTxHash: prepared.safeTxHash,
    txData: prepared.txData,
    chainId: prepared.chainId,
    safeVersion: prepared.safeVersion,
    managerCall: serializeCall(rotateCall),
    enableSessionHash: enableSessionDetails.permissionEnableHash,
    enableSessionTypedData: enableSessionDetails.enableSessionTypedData,
  });
}
