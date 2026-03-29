import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { getAccount, isSessionEnabled } from '@rhinestone/module-sdk';
import { createServiceClient } from '@/lib/supabase/server';
import { buildStoredSafe7579Session, getSafe7579SessionPermissionId, safe7579PublicClient, safeWalletChain } from '@/lib/agentWallet7579';
import { getSession } from '@/lib/session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, wallet_address, wallet_standard, wallet_status, wallet_migration_state, wallet_policy, wallet_modules, session_key_address, session_key_expires_at, session_key_rotated_at')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId && !['operator', 'admin'].includes(session.role ?? 'submitter')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let sessionEnabled: boolean | null = null;
  let permissionId: `0x${string}` | null = null;

  if (
    agent.wallet_address
    && agent.wallet_standard === 'safe7579'
    && agent.wallet_migration_state === 'migrated'
    && agent.wallet_policy
    && agent.wallet_modules?.sessionSalt
    && agent.session_key_address
    && agent.session_key_expires_at
  ) {
    try {
      const account = getAccount({
        address: getAddress(agent.wallet_address),
        type: 'safe',
        deployedOnChains: [safeWalletChain.id],
      });
      const storedSession = buildStoredSafe7579Session({
        sessionKeyAddress: getAddress(agent.session_key_address),
        sessionKeyValidAfter: agent.session_key_rotated_at
          ? Math.floor(new Date(agent.session_key_rotated_at).getTime() / 1000)
          : undefined,
        sessionKeyValidUntil: Math.floor(new Date(agent.session_key_expires_at).getTime() / 1000),
        policy: agent.wallet_policy,
        modules: agent.wallet_modules,
      });

      permissionId = getSafe7579SessionPermissionId(storedSession);
      sessionEnabled = await isSessionEnabled({
        client: safe7579PublicClient as never,
        account,
        permissionId,
      });
    } catch {
      sessionEnabled = false;
    }
  }

  return NextResponse.json({
    agentId: id,
    walletStandard: agent.wallet_standard ?? 'safe',
    walletStatus: agent.wallet_status ?? 'predicted',
    migrationState: agent.wallet_migration_state ?? 'legacy',
    sessionKeyAddress: agent.session_key_address,
    sessionKeyExpiresAt: agent.session_key_expires_at,
    sessionKeyRotatedAt: agent.session_key_rotated_at,
    sessionPermissionId: permissionId,
    sessionEnabled,
  });
}
