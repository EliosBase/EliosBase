import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { getAccount, isSessionEnabled } from '@rhinestone/module-sdk';
import { createServiceClient } from '@/lib/supabase/server';
import {
  buildStoredSafe7579Session,
  getSafe7579SessionPermissionId,
  readSafe7579EmissarySessionEnabled,
  safe7579PublicClient,
  safeWalletChain,
} from '@/lib/agentWallet7579';
import { getAgentWalletMigrationState, getAgentWalletModules, getAgentWalletSession, getAgentWalletStandard } from '@/lib/agentWalletCompat';
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
    .select('id, owner_id, wallet_address, wallet_status, wallet_policy')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId && !['operator', 'admin'].includes(session.role ?? 'submitter')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let sessionEnabled: boolean | null = null;
  let moduleSessionEnabled: boolean | null = null;
  let emissarySessionEnabled: boolean | null = null;
  let permissionId: `0x${string}` | null = null;
  const walletStandard = getAgentWalletStandard(agent);
  const migrationState = getAgentWalletMigrationState(agent);
  const modules = getAgentWalletModules(agent);
  const sessionState = getAgentWalletSession(agent);

  if (
    agent.wallet_address
    && walletStandard === 'safe7579'
    && migrationState === 'migrated'
    && agent.wallet_policy
    && modules?.sessionSalt
    && sessionState?.address
    && sessionState.validUntil
  ) {
    try {
      const account = getAccount({
        address: getAddress(agent.wallet_address),
        type: 'safe',
        deployedOnChains: [safeWalletChain.id],
      });
      const storedSession = buildStoredSafe7579Session({
        sessionKeyAddress: getAddress(sessionState.address),
        sessionKeyValidAfter: sessionState.rotatedAt
          ? Math.floor(new Date(sessionState.rotatedAt).getTime() / 1000)
          : undefined,
        sessionKeyValidUntil: Math.floor(new Date(sessionState.validUntil).getTime() / 1000),
        policy: agent.wallet_policy,
        modules,
      });

      permissionId = getSafe7579SessionPermissionId(storedSession);
      moduleSessionEnabled = await isSessionEnabled({
        client: safe7579PublicClient as never,
        account,
        permissionId,
      });
      emissarySessionEnabled = await readSafe7579EmissarySessionEnabled({
        safeAddress: getAddress(agent.wallet_address),
        session: storedSession,
      });
      sessionEnabled = Boolean(moduleSessionEnabled && emissarySessionEnabled);
    } catch {
      sessionEnabled = false;
      moduleSessionEnabled = false;
      emissarySessionEnabled = false;
    }
  }

  return NextResponse.json({
    agentId: id,
    walletStandard,
    walletStatus: agent.wallet_status ?? 'predicted',
    migrationState,
    sessionKeyAddress: sessionState?.address,
    sessionKeyExpiresAt: sessionState?.validUntil,
    sessionKeyRotatedAt: sessionState?.rotatedAt,
    sessionPermissionId: permissionId,
    sessionEnabled,
    moduleSessionEnabled,
    emissarySessionEnabled,
  });
}
