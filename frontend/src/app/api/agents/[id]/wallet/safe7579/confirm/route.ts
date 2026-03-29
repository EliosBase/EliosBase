import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { getAccount, isSessionEnabled } from '@rhinestone/module-sdk';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import { buildStoredSafe7579Session, getSafe7579SessionPermissionId, safe7579PublicClient, safeWalletChain } from '@/lib/agentWallet7579';

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
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, wallet_address, wallet_policy, wallet_modules, session_key_address, session_key_expires_at, session_key_rotated_at')
    .eq('id', id)
    .single();

  if (error || !agent || !agent.wallet_address || !agent.wallet_modules) {
    return NextResponse.json({ error: 'Agent Safe7579 migration was not prepared' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can confirm Safe7579 migration' }, { status: 403 });
  }

  const modules = agent.wallet_modules as Record<string, string | undefined>;
  const checks = [
    { type: 1n, address: modules.ownerValidator },
    { type: 1n, address: modules.smartSessionsValidator },
    { type: 3n, address: modules.compatibilityFallback },
    { type: 4n, address: modules.hook },
  ].filter((entry): entry is { type: bigint; address: `0x${string}` } => !!entry.address);

  try {
    const installed = await Promise.all(checks.map((entry) => safe7579PublicClient.readContract({
      address: agent.wallet_address as `0x${string}`,
      abi: accountAbi,
      functionName: 'isModuleInstalled',
      args: [entry.type, entry.address, '0x'],
    })));

    if (installed.some((value) => !value)) {
      return NextResponse.json({ error: 'Safe7579 modules are not fully installed onchain yet' }, { status: 409 });
    }

    const guard = await safe7579PublicClient.readContract({
      address: agent.wallet_address as `0x${string}`,
      abi: safeAbi,
      functionName: 'getGuard',
    });

    if (modules.guard && guard.toLowerCase() !== modules.guard.toLowerCase()) {
      return NextResponse.json({ error: 'Safe guard is not active onchain yet' }, { status: 409 });
    }

    if (agent.wallet_policy && agent.session_key_address && agent.session_key_expires_at && modules.sessionSalt) {
      const account = getAccount({
        address: getAddress(agent.wallet_address as `0x${string}`),
        type: 'safe',
        deployedOnChains: [safeWalletChain.id],
      });
      const session = buildStoredSafe7579Session({
        sessionKeyAddress: getAddress(agent.session_key_address),
        sessionKeyValidAfter: agent.session_key_rotated_at
          ? Math.floor(new Date(agent.session_key_rotated_at).getTime() / 1000)
          : undefined,
        sessionKeyValidUntil: Math.floor(new Date(agent.session_key_expires_at).getTime() / 1000),
        policy: agent.wallet_policy,
        modules: agent.wallet_modules,
      });
      const enabled = await isSessionEnabled({
        client: safe7579PublicClient as never,
        account,
        permissionId: getSafe7579SessionPermissionId(session),
      });

      if (!enabled) {
        return NextResponse.json({ error: 'Safe7579 session is not enabled onchain yet' }, { status: 409 });
      }
    }
  } catch (readError) {
    console.error('[safe7579] confirm failed:', readError);
    return NextResponse.json({ error: 'Safe7579 modules are not readable onchain yet' }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      wallet_status: 'ready',
      wallet_migration_state: 'migrated',
      wallet_standard: 'safe7579',
      wallet_revision: 2,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Safe7579 migrated onchain but failed to persist locally' }, { status: 500 });
  }

  return NextResponse.json({
    agentId: id,
    walletStatus: 'ready',
    migrationState: 'migrated',
  });
}
