import { NextRequest, NextResponse } from 'next/server';
import { getAddress, isAddress, parseEther, type Hex } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { generateId, logActivity, logAudit } from '@/lib/audit';
import {
  executeAgentWalletTransfer,
  resolveAgentWallet,
  type AgentWalletTransactionData,
} from '@/lib/agentWallets';
import { executeSafe7579SessionTransfer } from '@/lib/agentWallet7579Transfers';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import { insertTransactionRecord } from '@/lib/transactions';
import { toAgentWalletTransfer } from '@/lib/transforms';
import {
  getAgentWalletModules,
  getAgentWalletSession,
  inferTransferExecutionMode,
  isMigratedSafe7579,
} from '@/lib/agentWalletCompat';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

function isSafeTxData(value: unknown): value is AgentWalletTransactionData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.to === 'string'
    && typeof candidate.value === 'string'
    && typeof candidate.data === 'string'
    && typeof candidate.operation === 'number'
    && typeof candidate.safeTxGas === 'string'
    && typeof candidate.baseGas === 'string'
    && typeof candidate.gasPrice === 'string'
    && typeof candidate.gasToken === 'string'
    && typeof candidate.refundReceiver === 'string'
    && typeof candidate.nonce === 'number';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; transferId: string }> },
) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session.userId || !session.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.walletTransferMutation, session.userId);
  if (rateLimitError) return rateLimitError;

  const body = await req.json().catch(() => ({}));
  const ownerSignature = String(body.ownerSignature ?? '').trim();
  const txData = body.txData;

  const { id, transferId } = await params;
  const supabase = createServiceClient();
  const { data: transfer, error: transferError } = await supabase
    .from('agent_wallet_transfers')
    .select('*, agents(name)')
    .eq('id', transferId)
    .eq('agent_id', id)
    .single();

  if (transferError || !transfer) {
    return NextResponse.json({ error: 'Agent wallet transfer not found' }, { status: 404 });
  }

  if (transfer.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved agent wallet transfers can be executed' }, { status: 400 });
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can execute Safe transfers' }, { status: 403 });
  }

  if (!isAddress(transfer.destination)) {
    return NextResponse.json({ error: 'Approved transfer destination is invalid' }, { status: 400 });
  }

  const wallet = await resolveAgentWallet(agent);
  if (!wallet) {
    return NextResponse.json({ error: 'Agent wallet is not configured' }, { status: 400 });
  }

  const safeAddress = getAddress(transfer.safe_address);
  const destination = getAddress(transfer.destination);
  if (safeAddress !== wallet.address) {
    return NextResponse.json({ error: 'Approved transfer wallet does not match the current agent Safe' }, { status: 409 });
  }

  let hash: Hex;
  let blockNumber: number;

  try {
    const executionMode = inferTransferExecutionMode(transfer, agent);
    if (executionMode === 'session') {
      const modules = getAgentWalletModules(agent);
      const sessionState = getAgentWalletSession(agent);
      if (!isMigratedSafe7579(agent)) {
        return NextResponse.json({ error: 'This transfer expects a migrated Safe7579 wallet' }, { status: 409 });
      }
      if (!modules?.sessionSalt
        || !sessionState?.address
        || !sessionState.ciphertext
        || !sessionState.nonce
        || !sessionState.tag
        || !sessionState.validUntil
      ) {
        return NextResponse.json({ error: 'Safe7579 session data is incomplete' }, { status: 409 });
      }

      const execution = await executeSafe7579SessionTransfer({
        safeAddress,
        destination,
        amountEth: transfer.amount_eth,
        policy: wallet.policy,
        modules,
        sessionKeyAddress: getAddress(sessionState.address),
        sessionKeyValidAfter: sessionState.rotatedAt
          ? Math.floor(new Date(sessionState.rotatedAt).getTime() / 1000)
          : undefined,
        sessionKeyValidUntil: Math.floor(new Date(sessionState.validUntil).getTime() / 1000),
        sessionKeyCiphertext: sessionState.ciphertext,
        sessionKeyNonce: sessionState.nonce,
        sessionKeyTag: sessionState.tag,
      });
      hash = execution.txHash;
      blockNumber = execution.blockNumber;
    } else {
      if (!ownerSignature || !ownerSignature.startsWith('0x') || !isSafeTxData(txData)) {
        return NextResponse.json({ error: 'Safe execution requires a signed Safe transaction payload' }, { status: 400 });
      }
      if (getAddress(txData.to) !== destination) {
        return NextResponse.json({ error: 'Signed Safe transfer destination does not match the approved transfer' }, { status: 400 });
      }
      if (BigInt(txData.value) !== parseEther(transfer.amount_eth)) {
        return NextResponse.json({ error: 'Signed Safe transfer amount does not match the approved transfer' }, { status: 400 });
      }

      const execution = await executeAgentWalletTransfer({
        safeAddress,
        destination,
        amountEth: transfer.amount_eth,
        ownerAddress: getAddress(session.walletAddress),
        ownerSignature: ownerSignature as Hex,
        txData,
      });
      hash = execution.hash;
      blockNumber = execution.blockNumber;
    }
  } catch (error) {
    console.error('[agent-wallet] execute transfer failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to execute the Safe transfer';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const executedAt = new Date().toISOString();
  const { data: executedTransfer, error: updateError } = await supabase
    .from('agent_wallet_transfers')
    .update({
      status: 'executed',
      approvals_received: transfer.approvals_required,
      executed_at: executedAt,
      executed_by: session.userId,
      tx_hash: hash,
    })
    .eq('id', transferId)
    .eq('agent_id', id)
    .select('*, agents(name)')
    .single();

  if (updateError || !executedTransfer) {
    return NextResponse.json({ error: 'Safe transfer executed onchain but failed to persist locally' }, { status: 500 });
  }

  const transactionId = generateId('tx');
  const { error: transactionError } = await insertTransactionRecord(supabase, {
    id: transactionId,
    type: 'payment',
    from: safeAddress,
    to: destination,
    amount: `${transfer.amount_eth} ETH`,
    token: 'ETH',
    status: 'confirmed',
    tx_hash: hash,
    user_id: session.userId,
    block_number: blockNumber,
  });

  if (transactionError) {
    return NextResponse.json({ error: 'Safe transfer executed onchain but failed to record the payment locally' }, { status: 500 });
  }

  const actor = session.walletAddress;
  await logAudit({
    action: 'AGENT_WALLET_EXECUTE',
    actor,
    target: `${id}:${transferId}`,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'payment',
    message: `Agent Safe transfer executed for ${agent.name}: ${transfer.amount_eth} ETH`,
    userId: session.userId,
  });

  return NextResponse.json({
    transfer: toAgentWalletTransfer(executedTransfer),
    txHash: hash,
  });
}
