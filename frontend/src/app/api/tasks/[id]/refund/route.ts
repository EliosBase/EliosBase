import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { generateId, logActivity, logAudit } from '@/lib/audit';
import { publicClient } from '@/lib/viemClient';
import { ESCROW_CONTRACT_ADDRESS } from '@/lib/contracts';
import { validateOrigin } from '@/lib/csrf';
import { buildTaskDisputeSource } from '@/lib/taskDisputes';
import { insertTransactionRecord } from '@/lib/transactions';

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
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, reward, status, submitter_id')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.submitter_id !== session.userId) {
    return NextResponse.json({ error: 'Only the task submitter can refund escrow' }, { status: 403 });
  }

  const disputeSource = buildTaskDisputeSource(taskId);
  const { data: disputes } = await supabase
    .from('security_alerts')
    .select('id')
    .eq('source', disputeSource)
    .eq('resolved', false);

  const hasOpenDispute = (disputes ?? []).length > 0;
  if (task.status !== 'failed' && !hasOpenDispute) {
    return NextResponse.json(
      { error: 'Task must be failed or under dispute before refunding escrow' },
      { status: 400 },
    );
  }

  const actor = session.walletAddress ?? session.userId;
  let txStatus: 'confirmed' | 'pending' = 'pending';

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.to?.toLowerCase() !== ESCROW_CONTRACT_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction is not to the escrow contract' }, { status: 400 });
    }

    if (session.walletAddress && receipt.from.toLowerCase() !== session.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction sender does not match your wallet' }, { status: 400 });
    }

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction reverted on-chain' }, { status: 400 });
    }

    txStatus = 'confirmed';
  } catch {
    txStatus = 'pending';
  }

  const transactionId = generateId('tx');
  const { error: txError } = await insertTransactionRecord(supabase, {
    id: transactionId,
    type: 'escrow_refund',
    from: actor,
    to: actor,
    amount: task.reward,
    token: 'ETH',
    status: txStatus,
    tx_hash: txHash,
    user_id: session.userId,
  }, { allowLegacyRefundAlias: true });

  if (txError) {
    return NextResponse.json({ error: 'Failed to record refund transaction' }, { status: 500 });
  }

  if (txStatus === 'confirmed' && hasOpenDispute) {
    await supabase
      .from('security_alerts')
      .update({ resolved: true })
      .eq('source', disputeSource)
      .eq('resolved', false);
  }

  await logAudit({
    action: 'ESCROW_REFUND',
    actor,
    target: taskId,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'payment',
    message: `Escrow refunded for task: ${task.title}`,
    userId: session.userId,
  });

  return NextResponse.json({
    success: true,
    taskId,
    transactionId,
    txStatus,
  });
}
