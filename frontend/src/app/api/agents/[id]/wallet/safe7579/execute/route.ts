import { NextRequest, NextResponse } from 'next/server';
import { getAddress, type Hex } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import {
  buildPolicyManagerConfigureCall,
  buildSafe7579MigrationCalls,
} from '@/lib/agentWallet7579';
import {
  executePolicySignerCall,
} from '@/lib/agentWallet7579Transfers';
import { executeAgentWalletExecution, type AgentWalletTransactionData } from '@/lib/agentWallets';
import {
  getAgentWalletModules,
  mergeSafe7579Compatibility,
} from '@/lib/agentWalletCompat';
import { readSafe7579InstallationState } from '@/lib/agentWallet7579State';

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

  const body = await req.json().catch(() => ({}));
  const ownerSignature = body.ownerSignature as Hex | undefined;
  const txData = body.txData as AgentWalletTransactionData | undefined;
  if (!ownerSignature || !txData) {
    return NextResponse.json({ error: 'Owner signature and prepared Safe transaction data are required' }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, wallet_address, wallet_policy')
    .eq('id', id)
    .single();

  const modules = agent ? getAgentWalletModules(agent) : undefined;

  if (error || !agent || !agent.wallet_address || !agent.wallet_policy || !modules) {
    return NextResponse.json({ error: 'Safe7579 migration is not prepared for this agent' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can execute Safe7579 migration' }, { status: 403 });
  }

  if (!modules.hook || !modules.guard || !modules.policyManager) {
    return NextResponse.json({ error: 'Safe7579 migration metadata is incomplete' }, { status: 409 });
  }

  const safeAddress = getAddress(agent.wallet_address);
  const ownerWallet = getAddress(session.walletAddress);
  const safeCalls = buildSafe7579MigrationCalls({
    safeAddress,
    ownerWallet,
    hookAddress: getAddress(modules.hook),
    guardAddress: getAddress(modules.guard),
  });

  const managerCalls = [
    buildPolicyManagerConfigureCall({
      safeAddress,
      policy: agent.wallet_policy,
      modules,
    }),
  ];

  try {
    const safeExecution = await executeAgentWalletExecution({
      safeAddress,
      calls: safeCalls,
      ownerAddress: ownerWallet,
      ownerSignature,
      txData,
    });
    const managerReceipts = [];
    for (const call of managerCalls) {
      managerReceipts.push(await executePolicySignerCall(call));
    }

    const installation = await readSafe7579InstallationState({
      safeAddress,
      ownerWallet: getAddress(agent.wallet_policy.owner),
      hookAddress: getAddress(modules.hook),
      guardAddress: modules.guard ? getAddress(modules.guard) : undefined,
      fallbackHandlerAddress: modules.adapter ? getAddress(modules.adapter) : undefined,
    });
    const missingChecks = [
      !installation.ownerValidator ? 'ownerValidator' : null,
      !installation.smartSessionsValidator ? 'smartSessionsValidator' : null,
      !installation.compatibilityFallback ? 'compatibilityFallback' : null,
      !installation.hook ? 'hook' : null,
      !installation.guard ? 'guard' : null,
      !installation.fallbackHandler ? 'safeFallbackHandler' : null,
    ].filter((value): value is string => Boolean(value));

    if (missingChecks.length > 0) {
      return NextResponse.json({
        error: `Safe7579 migration transactions mined, but onchain verification is still missing: ${missingChecks.join(', ')}`,
      }, { status: 409 });
    }

    const nextPolicy = mergeSafe7579Compatibility(agent.wallet_policy, {
      migrationState: 'migrated',
      modules,
      session: null,
      revision: 2,
    });
    const { error: updateError } = await supabase
      .from('agents')
      .update({
        wallet_status: 'active',
        wallet_policy: nextPolicy,
      })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: 'Safe7579 migrated onchain but failed to persist locally' }, { status: 500 });
    }

    return NextResponse.json({
      agentId: id,
      walletStatus: 'active',
      migrationState: 'migrated',
      safeTxHash: safeExecution.hash,
      managerTxHashes: managerReceipts.map((receipt) => receipt.hash),
      sessionEnabled: false,
    });
  } catch (executionError) {
    const message = executionError instanceof Error ? executionError.message : 'Failed to execute Safe7579 migration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
