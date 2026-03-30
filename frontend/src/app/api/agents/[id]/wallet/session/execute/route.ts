import { NextRequest, NextResponse } from 'next/server';
import { getAddress, type Hex } from 'viem';
import { getAccount, isSessionEnabled } from '@rhinestone/module-sdk';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import {
  buildEnableSessionCall,
  buildRemoveSessionCall,
  buildRotateSessionKeyCall,
  buildStoredSafe7579Session,
  getSafe7579SessionPermissionId,
  readSafe7579EmissarySessionEnabled,
  safe7579PublicClient,
  safeWalletChain,
} from '@/lib/agentWallet7579';
import {
  bootstrapSafe7579SessionEnable,
  executePolicySignerCall,
} from '@/lib/agentWallet7579Transfers';
import {
  getAgentWalletMigrationState,
  getAgentWalletModules,
  getAgentWalletSession,
  getAgentWalletStandard,
  mergeSafe7579Compatibility,
} from '@/lib/agentWalletCompat';
import { executeAgentWalletExecution, type AgentWalletTransactionData } from '@/lib/agentWallets';

type PendingSessionPayload = {
  address: string;
  ciphertext: string;
  nonce: string;
  tag: string;
  validUntil: string;
  rotatedAt: string;
  sessionSalt: string;
};

function isPendingSessionPayload(value: unknown): value is PendingSessionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.address === 'string'
    && typeof candidate.ciphertext === 'string'
    && typeof candidate.nonce === 'string'
    && typeof candidate.tag === 'string'
    && typeof candidate.validUntil === 'string'
    && typeof candidate.rotatedAt === 'string'
    && typeof candidate.sessionSalt === 'string';
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

  const body = await req.json().catch(() => ({}));
  const ownerSignature = body.ownerSignature as Hex | undefined;
  const enableSessionSignature = body.enableSessionSignature as Hex | undefined;
  const txData = body.txData as AgentWalletTransactionData | undefined;
  const pendingSession = body.pendingSession;
  if (!ownerSignature || !enableSessionSignature || !txData || !isPendingSessionPayload(pendingSession)) {
    return NextResponse.json({ error: 'Owner signatures, prepared Safe transaction data, and pending session metadata are required' }, { status: 400 });
  }

  const validUntilMs = new Date(pendingSession.validUntil).getTime();
  const rotatedAtMs = new Date(pendingSession.rotatedAt).getTime();
  if (!Number.isFinite(validUntilMs) || !Number.isFinite(rotatedAtMs)) {
    return NextResponse.json({ error: 'Pending session timestamps are invalid' }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, owner_id, wallet_address, wallet_policy, wallet_status')
    .eq('id', id)
    .single();

  if (error || !agent || !agent.wallet_address || !agent.wallet_policy) {
    return NextResponse.json({ error: 'Agent Safe7579 migration was not prepared' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can enable the Safe7579 session key' }, { status: 403 });
  }

  if (getAgentWalletStandard(agent) !== 'safe7579' || getAgentWalletMigrationState(agent) !== 'migrated') {
    return NextResponse.json({ error: 'Enable the Safe7579 session key after the wallet migration is complete' }, { status: 409 });
  }

  const currentModules = getAgentWalletModules(agent);
  if (!currentModules?.hook || !currentModules.policyManager) {
    return NextResponse.json({ error: 'Safe7579 module metadata is incomplete' }, { status: 409 });
  }

  const safeAddress = getAddress(agent.wallet_address);
  const ownerWallet = getAddress(session.walletAddress);
  const nextModules = {
    ...currentModules,
    sessionSalt: pendingSession.sessionSalt,
  };
  const nextSession = buildStoredSafe7579Session({
    sessionKeyAddress: getAddress(pendingSession.address),
    sessionKeyValidAfter: Math.floor(rotatedAtMs / 1000),
    sessionKeyValidUntil: Math.floor(validUntilMs / 1000),
    policy: agent.wallet_policy,
    modules: nextModules,
  });

  const safeCalls = [];
  const currentSession = getAgentWalletSession(agent);
  if (currentSession?.address && currentSession.validUntil && currentModules.sessionSalt) {
    const storedSession = buildStoredSafe7579Session({
      sessionKeyAddress: getAddress(currentSession.address),
      sessionKeyValidAfter: currentSession.rotatedAt
        ? Math.floor(new Date(currentSession.rotatedAt).getTime() / 1000)
        : undefined,
      sessionKeyValidUntil: Math.floor(new Date(currentSession.validUntil).getTime() / 1000),
      policy: agent.wallet_policy,
      modules: currentModules,
    });
    safeCalls.push(buildRemoveSessionCall(getSafe7579SessionPermissionId(storedSession)));
  }
  safeCalls.push(buildEnableSessionCall(nextSession));

  try {
    const safeExecution = await executeAgentWalletExecution({
      safeAddress,
      calls: safeCalls,
      ownerAddress: ownerWallet,
      ownerSignature,
      txData,
    });
    const managerReceipt = await executePolicySignerCall(
      buildRotateSessionKeyCall({
        safeAddress,
        sessionKeyAddress: getAddress(pendingSession.address),
        validUntil: Math.floor(validUntilMs / 1000),
      }),
    );
    const emissaryReceipt = await bootstrapSafe7579SessionEnable({
      safeAddress,
      ownerEnableSignature: enableSessionSignature,
      ownerWalletAddress: ownerWallet,
      policy: agent.wallet_policy,
      modules: nextModules,
      sessionKeyAddress: getAddress(pendingSession.address),
      sessionKeyValidAfter: Math.floor(rotatedAtMs / 1000),
      sessionKeyValidUntil: Math.floor(validUntilMs / 1000),
      sessionKeyCiphertext: pendingSession.ciphertext,
      sessionKeyNonce: pendingSession.nonce,
      sessionKeyTag: pendingSession.tag,
    });

    const account = getAccount({
      address: safeAddress,
      type: 'safe',
      deployedOnChains: [safeWalletChain.id],
    });
    const enabled = await isSessionEnabled({
      client: safe7579PublicClient as never,
      account,
      permissionId: getSafe7579SessionPermissionId(nextSession),
    });
    const emissaryEnabled = await readSafe7579EmissarySessionEnabled({
      safeAddress,
      session: nextSession,
    });

    if (!enabled) {
      return NextResponse.json({ error: 'Safe7579 session enable transaction mined, but the permission is not active onchain' }, { status: 409 });
    }
    if (!emissaryEnabled) {
      return NextResponse.json({ error: 'Safe7579 session permission is active, but the emissary validator is not configured onchain' }, { status: 409 });
    }

    const nextPolicy = mergeSafe7579Compatibility(agent.wallet_policy, {
      migrationState: 'migrated',
      modules: nextModules,
      session: {
        address: pendingSession.address,
        ciphertext: pendingSession.ciphertext,
        nonce: pendingSession.nonce,
        tag: pendingSession.tag,
        validUntil: pendingSession.validUntil,
        rotatedAt: pendingSession.rotatedAt,
      },
      revision: 2,
    });
    const { error: updateError } = await supabase
      .from('agents')
      .update({
        wallet_status: 'ready',
        wallet_policy: nextPolicy,
      })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: 'Safe7579 session is enabled onchain but failed to persist locally' }, { status: 500 });
    }

    return NextResponse.json({
      agentId: id,
      walletStatus: 'ready',
      sessionEnabled: true,
      safeTxHash: safeExecution.hash,
      managerTxHash: managerReceipt.hash,
      emissaryTxHash: emissaryReceipt.txHash,
      emissaryUserOpHash: emissaryReceipt.userOpHash,
      sessionKeyAddress: pendingSession.address,
    });
  } catch (executionError) {
    const message = executionError instanceof Error ? executionError.message : 'Failed to enable the Safe7579 session key';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
