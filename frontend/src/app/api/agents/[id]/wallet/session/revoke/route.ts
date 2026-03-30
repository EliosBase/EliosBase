import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, getAddress } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import {
  ELIOS_POLICY_MANAGER_ABI,
  SAFE_7579_POLICY_MANAGER_ADDRESS,
  buildRemoveSessionCall,
  buildStoredSafe7579Session,
  getSafe7579SessionPermissionId,
} from '@/lib/agentWallet7579';
import { getAgentWalletMigrationState, getAgentWalletModules, getAgentWalletSession, getAgentWalletStandard, mergeSafe7579Compatibility } from '@/lib/agentWalletCompat';

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
    .select('id, owner_id, wallet_address, wallet_policy')
    .eq('id', id)
    .single();

  const modules = agent ? getAgentWalletModules(agent) : undefined;
  const currentSession = agent ? getAgentWalletSession(agent) : undefined;

  if (error || !agent || !agent.wallet_address || !agent.wallet_policy || !modules?.sessionSalt || !currentSession?.address || !currentSession.validUntil) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can revoke the session key' }, { status: 403 });
  }

  if (getAgentWalletStandard(agent) !== 'safe7579' || getAgentWalletMigrationState(agent) !== 'migrated') {
    return NextResponse.json({ error: 'Safe7579 must be fully migrated before revoking the session key' }, { status: 409 });
  }

  const storedSession = buildStoredSafe7579Session({
    sessionKeyAddress: getAddress(currentSession.address),
    sessionKeyValidAfter: currentSession.rotatedAt
      ? Math.floor(new Date(currentSession.rotatedAt).getTime() / 1000)
      : undefined,
    sessionKeyValidUntil: Math.floor(new Date(currentSession.validUntil).getTime() / 1000),
    policy: agent.wallet_policy,
    modules,
  });
  const permissionId = getSafe7579SessionPermissionId(storedSession);
  const removeSessionCall = buildRemoveSessionCall(permissionId);

  const managerCall = {
    to: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    value: '0',
    data: encodeFunctionData({
      abi: ELIOS_POLICY_MANAGER_ABI,
      functionName: 'revokeSessionKey',
      args: [getAddress(agent.wallet_address)],
    }),
  };

  const revokedAt = new Date().toISOString();
  const nextPolicy = mergeSafe7579Compatibility(agent.wallet_policy, {
    migrationState: 'migrated',
    modules,
    session: {
      ...currentSession,
      validUntil: revokedAt,
    },
    revision: 2,
  });
  const { error: updateError } = await supabase
    .from('agents')
    .update({
      wallet_policy: nextPolicy,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to persist the revoked session key state' }, { status: 500 });
  }

  return NextResponse.json({
    agentId: id,
    permissionId,
    safeCalls: [{
      to: removeSessionCall.to,
      value: removeSessionCall.value.toString(),
      data: removeSessionCall.data,
    }],
    managerCall,
  });
}
