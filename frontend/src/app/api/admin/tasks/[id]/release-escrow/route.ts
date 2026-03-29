import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity, generateId } from '@/lib/audit';
import { verifyEscrowActionTransaction } from '@/lib/transactionVerification';
import { resolveAgentWallet } from '@/lib/agentWallets';

// POST /api/admin/tasks/[id]/release-escrow — admin override escrow release (skips ZK check)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id: taskId } = await params;
  const body = await req.json();
  const { txHash } = body;

  if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const actor = auth.session.walletAddress ?? auth.session.userId;

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address))')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Verify the transaction on-chain
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
  const agentOperator = agentWallet?.address ?? task.agents?.users?.wallet_address ?? task.assigned_agent ?? '';
  try {
    ({ txStatus } = await verifyEscrowActionTransaction(txHash as `0x${string}`, {
      action: 'release',
      taskId,
      recipient: agentWallet?.address ?? task.agents?.users?.wallet_address ?? undefined,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Transaction ')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }

  // Record transaction
  const txId = generateId('tx');
  await supabase.from('transactions').insert({
    id: txId,
    type: 'escrow_release',
    from: actor,
    to: agentWallet ? `${task.agents?.name ?? task.assigned_agent ?? 'Agent'} Safe` : agentOperator,
    amount: task.reward,
    token: 'ETH',
    status: txStatus,
    tx_hash: txHash,
    user_id: auth.session.userId,
  });

  await logAudit({ action: 'ESCROW_RELEASE', actor, target: `${taskId} (admin override)`, result: 'ALLOW' });
  await logActivity({ type: 'payment', message: `Admin released escrow for task: ${task.title}`, userId: auth.session.userId });

  return NextResponse.json({ success: true, taskId, transactionId: txId, txStatus });
}
