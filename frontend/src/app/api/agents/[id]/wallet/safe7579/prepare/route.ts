import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import { buildAgentWalletPolicy, prepareAgentWalletExecution, provisionAgentWallet } from '@/lib/agentWallets';
import {
  SAFE_7579_GUARD_ADDRESS,
  SAFE_7579_HOOK_ADDRESS,
  SAFE_7579_POLICY_MANAGER_ADDRESS,
  buildPolicyManagerConfigureCall,
  buildSafe7579MigrationCalls,
  buildSafe7579ModuleMetadata,
  buildSafe7579Policy,
} from '@/lib/agentWallet7579';
import { mergeSafe7579Compatibility } from '@/lib/agentWalletCompat';

function serializeCall(call: { to: string; value: { toString(): string }; data: `0x${string}` }) {
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
    .select('id, name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can prepare Safe7579 migration' }, { status: 403 });
  }

  const ownerWallet = getAddress(session.walletAddress);
  let wallet;
  try {
    wallet = await provisionAgentWallet(id, ownerWallet);
  } catch (walletError) {
    console.error('[agent-wallet] failed to deploy Safe before Safe7579 prepare:', walletError);
    return NextResponse.json({ error: 'Failed to deploy the agent Safe before Safe7579 migration' }, { status: 500 });
  }

  if (wallet.status !== 'active') {
    return NextResponse.json({ error: 'Agent Safe is not deployed on Base yet' }, { status: 409 });
  }

  const legacyPolicy = agent.wallet_policy ?? buildAgentWalletPolicy(ownerWallet);
  const policy = {
    ...buildSafe7579Policy(ownerWallet),
    blockedDestinations: legacyPolicy.blockedDestinations,
    allowlistedContracts: legacyPolicy.allowlistedContracts ?? [],
  };
  const modules = buildSafe7579ModuleMetadata({
    policyManager: getAddress(SAFE_7579_POLICY_MANAGER_ADDRESS),
    guard: getAddress(SAFE_7579_GUARD_ADDRESS),
    hook: getAddress(SAFE_7579_HOOK_ADDRESS),
  });
  const nextPolicy = mergeSafe7579Compatibility(policy, {
    migrationState: 'pending',
    modules,
    session: null,
    revision: 2,
  });

  const safeCalls = buildSafe7579MigrationCalls({
    safeAddress: wallet.address,
    ownerWallet,
    hookAddress: getAddress(SAFE_7579_HOOK_ADDRESS),
    guardAddress: getAddress(SAFE_7579_GUARD_ADDRESS),
  });

  const managerCalls = [
    buildPolicyManagerConfigureCall({
      safeAddress: wallet.address,
      policy,
      modules,
    }),
  ];
  const prepared = await prepareAgentWalletExecution({
    safeAddress: wallet.address,
    calls: safeCalls,
  });

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      wallet_status: 'active',
      wallet_policy: nextPolicy,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to persist the Safe7579 migration payload' }, { status: 500 });
  }

  return NextResponse.json({
    agentId: id,
    safeAddress: wallet.address,
    walletStandard: 'safe',
    migrationState: 'pending',
    modules,
    safeCalls: safeCalls.map(serializeCall),
    managerCalls: managerCalls.map(serializeCall),
    safeTxHash: prepared.safeTxHash,
    txData: prepared.txData,
    chainId: prepared.chainId,
    safeVersion: prepared.safeVersion,
  });
}
