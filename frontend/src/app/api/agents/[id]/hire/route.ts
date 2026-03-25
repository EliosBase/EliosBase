import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity, generateId } from '@/lib/audit';
import { publicClient } from '@/lib/viemClient';
import { validateOrigin } from '@/lib/csrf';
import { ESCROW_CONTRACT_ADDRESS } from '@/lib/contracts';

// POST /api/agents/[id]/hire — hire an agent with a verified on-chain escrow tx
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const { id: agentId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();
  const actor = session.walletAddress ?? session.userId;

  // Require a real transaction hash
  if (!body.txHash || typeof body.txHash !== 'string' || !body.txHash.startsWith('0x')) {
    return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
  }

  // Fetch the agent
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.status === 'offline') {
    return NextResponse.json({ error: 'Agent is offline' }, { status: 400 });
  }

  if (agent.status === 'busy') {
    return NextResponse.json({ error: 'Agent is already busy' }, { status: 409 });
  }

  // Verify the transaction on-chain
  let txStatus: 'confirmed' | 'pending' = 'pending';

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: body.txHash as `0x${string}`,
    });

    // Verify the tx went to our escrow contract
    if (receipt.to?.toLowerCase() !== ESCROW_CONTRACT_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction is not to the escrow contract' }, { status: 400 });
    }

    // Verify the sender matches the session wallet
    if (session.walletAddress && receipt.from.toLowerCase() !== session.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Transaction sender does not match your wallet' }, { status: 400 });
    }

    if (receipt.status === 'success') {
      txStatus = 'confirmed';
    } else {
      return NextResponse.json({ error: 'Transaction reverted on-chain' }, { status: 400 });
    }
  } catch {
    // Receipt not available yet — tx may still be pending, store as pending
    txStatus = 'pending';
  }

  // Atomically set agent to busy (prevents double-hire)
  const { data: updatedAgent, error: updateError } = await supabase
    .from('agents')
    .update({ status: 'busy' })
    .eq('id', agentId)
    .eq('status', 'online')
    .select()
    .single();

  if (updateError || !updatedAgent) {
    return NextResponse.json({ error: 'Agent is no longer available' }, { status: 409 });
  }

  // Store the real transaction
  const txId = generateId('tx');
  const { error: txError } = await supabase.from('transactions').insert({
    id: txId,
    type: 'escrow_lock',
    from: actor,
    to: agentId,
    amount: agent.price_per_task,
    token: 'ETH',
    status: txStatus,
    tx_hash: body.txHash,
    user_id: session.userId,
  });

  if (txError) {
    // Rollback agent status
    await supabase.from('agents').update({ status: 'online' }).eq('id', agentId);
    return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
  }

  // If a taskId was provided, assign the agent to that task
  if (body.taskId) {
    await supabase
      .from('tasks')
      .update({
        assigned_agent: agentId,
        current_step: 'Assigned',
        step_changed_at: new Date().toISOString(),
      })
      .eq('id', body.taskId);
  }

  // Audit + activity logging
  await logAudit({ action: 'AGENT_HIRE', actor, target: agentId, result: 'ALLOW' });
  await logAudit({ action: 'ESCROW_LOCK', actor, target: txId, result: 'ALLOW' });
  await logActivity({ type: 'agent', message: `Agent hired: ${agent.name}`, userId: session.userId });
  await logActivity({ type: 'payment', message: `Escrow locked: ${agent.price_per_task} for ${agent.name}`, userId: session.userId });

  return NextResponse.json({
    success: true,
    agentId,
    transactionId: txId,
    agentName: agent.name,
    txHash: body.txHash,
    txStatus,
  }, { status: 201 });
}
