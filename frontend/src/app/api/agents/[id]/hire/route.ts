import { NextRequest, NextResponse } from 'next/server';
import { createUserServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity, generateId } from '@/lib/audit';
import { validateOrigin } from '@/lib/csrf';
import { verifyEscrowActionTransaction } from '@/lib/transactionVerification';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

// POST /api/agents/[id]/hire — hire an agent with a verified on-chain escrow tx
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const { id: agentId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.hireAgent, session.userId);
  if (rateLimitError) return rateLimitError;

  const body = await req.json();
  const supabase = createUserServerClient();
  const actor = session.walletAddress ?? session.userId;

  // Require a real transaction hash
  if (!body.txHash || typeof body.txHash !== 'string' || !body.txHash.startsWith('0x')) {
    return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
  }

  if (!body.taskId || typeof body.taskId !== 'string') {
    return NextResponse.json({ error: 'Valid taskId is required' }, { status: 400 });
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

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, status, assigned_agent, current_step, step_changed_at')
    .eq('id', body.taskId)
    .eq('submitter_id', session.userId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status !== 'active') {
    return NextResponse.json({ error: 'Task is no longer active' }, { status: 409 });
  }

  if (task.assigned_agent) {
    return NextResponse.json({ error: 'Task is already assigned' }, { status: 409 });
  }

  // Verify the transaction on-chain
  let txStatus: 'confirmed' | 'pending' = 'pending';

  try {
    ({ txStatus } = await verifyEscrowActionTransaction(body.txHash as `0x${string}`, {
      action: 'lock',
      taskId: body.taskId,
      agentId,
      depositor: session.walletAddress,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Transaction ')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
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

  const { data: assignedTask, error: assignError } = await supabase
    .from('tasks')
    .update({
      assigned_agent: agentId,
      current_step: 'Assigned',
      step_changed_at: new Date().toISOString(),
    })
    .eq('id', body.taskId)
    .eq('submitter_id', session.userId)
    .eq('status', 'active')
    .is('assigned_agent', null)
    .select('id')
    .single();

  if (assignError || !assignedTask) {
    await supabase.from('agents').update({ status: 'online' }).eq('id', agentId);
    return NextResponse.json({ error: 'Task is no longer available for assignment' }, { status: 409 });
  }

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
    await Promise.all([
      supabase.from('agents').update({ status: 'online' }).eq('id', agentId),
      supabase
        .from('tasks')
        .update({
          assigned_agent: null,
          current_step: task.current_step,
          step_changed_at: task.step_changed_at,
        })
        .eq('id', body.taskId)
        .eq('submitter_id', session.userId),
    ]);
    return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
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
