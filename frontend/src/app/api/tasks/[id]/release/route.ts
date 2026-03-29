import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity, generateId } from '@/lib/audit';
import { publicClient } from '@/lib/viemClient';
import { VERIFIER_ABI, VERIFIER_CONTRACT_ADDRESS } from '@/lib/contracts';
import { validateOrigin } from '@/lib/csrf';
import { stringToHex } from 'viem';
import { insertTransactionRecord } from '@/lib/transactions';
import { verifyEscrowActionTransaction } from '@/lib/transactionVerification';
import { resolveAgentWallet } from '@/lib/agentWallets';

// POST /api/tasks/[id]/release — release escrowed funds after task completion
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const { id: taskId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { txHash } = body;

  if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch task with agent operator info
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address))')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Only the task submitter can release funds
  if (task.submitter_id !== session.userId) {
    return NextResponse.json({ error: 'Only the task submitter can release funds' }, { status: 403 });
  }

  // Task must be completed
  if (task.status !== 'completed' || task.current_step !== 'Complete') {
    return NextResponse.json({ error: 'Task must be completed before releasing funds' }, { status: 400 });
  }

  // Check ZK proof is verified on-chain
  try {
    const taskIdBytes32 = stringToHex(taskId, { size: 32 });
    const isVerified = await publicClient.readContract({
      address: VERIFIER_CONTRACT_ADDRESS,
      abi: VERIFIER_ABI,
      functionName: 'isVerified',
      args: [taskIdBytes32],
    });
    if (!isVerified) {
      return NextResponse.json({ error: 'ZK proof has not been verified on-chain' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to check ZK proof verification status' }, { status: 500 });
  }

  // Verify the release transaction on-chain
  const actor = session.walletAddress ?? session.userId;
  let txStatus: 'confirmed' | 'pending' = 'pending';
  const agentWallet = task.agents
    ? await resolveAgentWallet({
      id: task.assigned_agent ?? '',
      wallet_address: task.agents.wallet_address,
      wallet_policy: task.agents.wallet_policy,
      wallet_status: task.agents.wallet_status,
      users: task.agents.users ?? undefined,
    })
    : null;
  const releaseRecipient = agentWallet?.address ?? task.agents?.users?.wallet_address ?? undefined;

  try {
    ({ txStatus } = await verifyEscrowActionTransaction(txHash as `0x${string}`, {
      action: 'release',
      taskId,
      recipient: releaseRecipient,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Transaction ')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }

  // Record escrow_release transaction
  const txId = generateId('tx');
  const releaseTarget = agentWallet
    ? `${task.agents?.name ?? task.assigned_agent ?? 'Agent'} Safe`
    : task.agents?.name ?? task.assigned_agent ?? releaseRecipient ?? '';

  const { error: txError } = await insertTransactionRecord(supabase, {
    id: txId,
    type: 'escrow_release',
    from: 'Escrow Vault',
    to: releaseTarget,
    amount: task.reward,
    token: 'ETH',
    status: txStatus,
    tx_hash: txHash,
    user_id: session.userId,
  });

  if (txError) {
    return NextResponse.json({ error: 'Failed to record release transaction' }, { status: 500 });
  }

  // Audit + activity logging
  await logAudit({
    action: 'ESCROW_RELEASE',
    actor,
    target: taskId,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'payment',
    message: `Escrow released for task: ${task.title}`,
    userId: session.userId,
  });

  return NextResponse.json({
    success: true,
    taskId,
    transactionId: txId,
    txStatus,
  });
}
