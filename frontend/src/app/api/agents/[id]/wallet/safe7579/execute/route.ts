import { NextRequest, NextResponse } from 'next/server';
import { getAddress, type Hex } from 'viem';
import { getAccount, isSessionEnabled } from '@rhinestone/module-sdk';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import {
  buildPolicyManagerConfigureCall,
  buildRotateSessionKeyCall,
  buildSafe7579MigrationCalls,
  buildStoredSafe7579Session,
  getSafe7579SessionPermissionId,
  safe7579PublicClient,
  safeWalletChain,
} from '@/lib/agentWallet7579';
import {
  executePolicySignerCall,
} from '@/lib/agentWallet7579Transfers';
import { executeAgentWalletExecution, type AgentWalletTransactionData } from '@/lib/agentWallets';
import {
  getAgentWalletModules,
  getAgentWalletSession,
  mergeSafe7579Compatibility,
} from '@/lib/agentWalletCompat';

const accountAbi = [
  {
    type: 'function',
    name: 'isModuleInstalled',
    inputs: [
      { name: 'moduleTypeId', type: 'uint256' },
      { name: 'module', type: 'address' },
      { name: 'additionalContext', type: 'bytes' },
    ],
    outputs: [{ name: 'isInstalled', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

const safeAbi = [
  {
    type: 'function',
    name: 'getGuard',
    inputs: [],
    outputs: [{ name: 'guard', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

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
  const sessionState = agent ? getAgentWalletSession(agent) : undefined;

  if (error || !agent || !agent.wallet_address || !agent.wallet_policy || !modules || !sessionState?.address || !sessionState.validUntil) {
    return NextResponse.json({ error: 'Safe7579 migration is not prepared for this agent' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can execute Safe7579 migration' }, { status: 403 });
  }

  if (!modules.hook || !modules.guard || !modules.policyManager || !modules.sessionSalt) {
    return NextResponse.json({ error: 'Safe7579 migration metadata is incomplete' }, { status: 409 });
  }

  const safeAddress = getAddress(agent.wallet_address);
  const ownerWallet = getAddress(session.walletAddress);
  const storedSession = buildStoredSafe7579Session({
    sessionKeyAddress: getAddress(sessionState.address),
    sessionKeyValidUntil: Math.floor(new Date(sessionState.validUntil).getTime() / 1000),
    policy: agent.wallet_policy,
    modules,
  });
  const safeCalls = buildSafe7579MigrationCalls({
    safeAddress,
    ownerWallet,
    session: storedSession,
    hookAddress: getAddress(modules.hook),
    guardAddress: getAddress(modules.guard),
  });

  const managerCalls = [
    buildPolicyManagerConfigureCall({
      safeAddress,
      policy: agent.wallet_policy,
      modules,
    }),
    buildRotateSessionKeyCall({
      safeAddress,
      sessionKeyAddress: getAddress(sessionState.address),
      validUntil: Math.floor(new Date(sessionState.validUntil).getTime() / 1000),
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

    const installedModules = modules as Record<string, string | undefined>;
    const checks = [
      { type: 1n, address: installedModules.ownerValidator },
      { type: 1n, address: installedModules.smartSessionsValidator },
      { type: 3n, address: installedModules.compatibilityFallback },
      { type: 4n, address: installedModules.hook },
    ].filter((entry): entry is { type: bigint; address: `0x${string}` } => !!entry.address);
    const installed = await Promise.all(checks.map((entry) => safe7579PublicClient.readContract({
      address: safeAddress,
      abi: accountAbi,
      functionName: 'isModuleInstalled',
      args: [entry.type, entry.address, '0x'],
    })));
    if (installed.some((value) => !value)) {
      return NextResponse.json({ error: 'Safe7579 migration transactions mined, but modules are not fully installed onchain' }, { status: 409 });
    }

    const guard = await safe7579PublicClient.readContract({
      address: safeAddress,
      abi: safeAbi,
      functionName: 'getGuard',
    });
    if (installedModules.guard && guard.toLowerCase() !== installedModules.guard.toLowerCase()) {
      return NextResponse.json({ error: 'Safe7579 migration transactions mined, but the guard is not active onchain' }, { status: 409 });
    }

    const account = getAccount({
      address: safeAddress,
      type: 'safe',
      deployedOnChains: [safeWalletChain.id],
    });
    const enabled = await isSessionEnabled({
      client: safe7579PublicClient as never,
      account,
      permissionId: getSafe7579SessionPermissionId(storedSession),
    });
    if (!enabled) {
      return NextResponse.json({ error: 'Safe7579 migration transactions mined, but the session key is not enabled onchain' }, { status: 409 });
    }

    const nextPolicy = mergeSafe7579Compatibility(agent.wallet_policy, {
      migrationState: 'migrated',
      modules,
      session: sessionState,
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
    });
  } catch (executionError) {
    const message = executionError instanceof Error ? executionError.message : 'Failed to execute Safe7579 migration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
