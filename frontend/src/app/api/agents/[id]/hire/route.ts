import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity } from '@/lib/audit';

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

  // Create an escrow transaction (lock funds for the hire)
  const txId = `tx-${Date.now().toString(36)}`;
  const amount = agent.price_per_task;
  const { error: txError } = await supabase.from('transactions').insert({
    id: txId,
    type: 'escrow_lock',
    from: actor,
    to: agentId,
    amount,
    token: 'ETH',
    status: 'confirmed',
    tx_hash: `0x${Date.now().toString(16)}`,
    user_id: session.userId,
  });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  // If a taskId was provided, assign the agent to that task
  if (body.taskId) {
    await supabase
      .from('tasks')
      .update({ assigned_agent: agentId, current_step: 'Assigned' })
      .eq('id', body.taskId);
  }

  // Update agent status to "busy"
  await supabase
    .from('agents')
    .update({ status: 'busy' })
    .eq('id', agentId);

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
    message: `Escrow locked: ${amount} ETH for ${agent.name}`,
    userId: session.userId,
  });

  return NextResponse.json({
    success: true,
    agentId,
    transactionId: txId,
    agentName: agent.name,
  }, { status: 201 });
}
