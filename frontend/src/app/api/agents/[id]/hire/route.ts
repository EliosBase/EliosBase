import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity, generateId } from '@/lib/audit';

// POST /api/agents/[id]/hire — hire an agent
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();
  const actor = session.walletAddress ?? session.userId;

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

  // Atomically set agent to busy (only if still online — prevents double-hire race)
  const { data: updatedAgent, error: updateError } = await supabase
    .from('agents')
    .update({ status: 'busy' })
    .eq('id', agentId)
    .eq('status', 'online')
    .select()
    .single();

  if (updateError || !updatedAgent) {
    return NextResponse.json(
      { error: 'Agent is no longer available' },
      { status: 409 }
    );
  }

  // Create an escrow transaction (lock funds for the hire)
  const txId = generateId('tx');
  const amount = agent.price_per_task;
  const { error: txError } = await supabase.from('transactions').insert({
    id: txId,
    type: 'escrow_lock',
    from: actor,
    to: agentId,
    amount,
    token: 'ETH',
    status: 'confirmed',
    tx_hash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
    user_id: session.userId,
  });

  if (txError) {
    // Rollback agent status
    await supabase.from('agents').update({ status: 'online' }).eq('id', agentId);
    return NextResponse.json({ error: 'Failed to create escrow transaction' }, { status: 500 });
  }

  // If a taskId was provided, assign the agent to that task
  if (body.taskId) {
    await supabase
      .from('tasks')
      .update({ assigned_agent: agentId, current_step: 'Assigned' })
      .eq('id', body.taskId);
  }

  // Audit + activity logging
  await logAudit({ action: 'AGENT_HIRE', actor, target: agentId, result: 'ALLOW' });
  await logAudit({ action: 'ESCROW_LOCK', actor, target: txId, result: 'ALLOW' });
  await logActivity({
    type: 'agent',
    message: `Agent hired: ${agent.name}`,
    userId: session.userId,
  });
  await logActivity({
    type: 'payment',
    message: `Escrow locked: ${amount} for ${agent.name}`,
    userId: session.userId,
  });

  return NextResponse.json({
    success: true,
    agentId,
    transactionId: txId,
    agentName: agent.name,
  }, { status: 201 });
}
