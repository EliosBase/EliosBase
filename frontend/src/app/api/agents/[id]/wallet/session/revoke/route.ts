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
    .select('id, owner_id, wallet_address, wallet_standard, wallet_migration_state, wallet_policy, wallet_modules, session_key_address, session_key_expires_at')
    .eq('id', id)
    .single();

  if (error || !agent || !agent.wallet_address || !agent.wallet_policy || !agent.wallet_modules?.sessionSalt || !agent.session_key_address || !agent.session_key_expires_at) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can revoke the session key' }, { status: 403 });
  }

  if (agent.wallet_standard !== 'safe7579' || agent.wallet_migration_state !== 'migrated') {
    return NextResponse.json({ error: 'Safe7579 must be fully migrated before revoking the session key' }, { status: 409 });
  }

  const storedSession = buildStoredSafe7579Session({
    sessionKeyAddress: getAddress(agent.session_key_address),
    sessionKeyValidUntil: Math.floor(new Date(agent.session_key_expires_at).getTime() / 1000),
    policy: agent.wallet_policy,
    modules: agent.wallet_modules,
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

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      session_key_expires_at: new Date().toISOString(),
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
