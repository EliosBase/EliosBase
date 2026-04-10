import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';

const suspendSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

/**
 * POST /api/admin/agents/[id]/suspend
 *
 * Suspend an agent and eagerly fail all of its active tasks. A suspended
 * agent is hidden from the public marketplace and cannot be hired. Any
 * task currently assigned to the agent is marked as failed so that the
 * submitter can recover escrowed funds through the normal refund flow.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id: agentId } = await params;
  const actor = auth.session.walletAddress ?? auth.session.userId;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = suspendSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const { reason } = parsed.data;

  const supabase = createServiceClient();

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name, status')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.status === 'suspended') {
    return NextResponse.json({ error: 'Agent is already suspended' }, { status: 409 });
  }

  const suspendedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      status: 'suspended',
      suspended_at: suspendedAt,
      suspended_reason: reason,
      suspended_by: actor,
    })
    .eq('id', agentId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to suspend agent' }, { status: 500 });
  }

  // Eager cascade: fail all active tasks assigned to this agent.
  // Untrusted agent work cannot be trusted to complete cleanly.
  const { data: affectedTasks, error: tasksError } = await supabase
    .from('tasks')
    .update({
      status: 'failed',
      step_changed_at: suspendedAt,
    })
    .eq('assigned_agent', agentId)
    .eq('status', 'active')
    .select('id, title, reward');

  if (tasksError) {
    // Agent is already suspended; surface the partial failure so the
    // operator knows tasks were not cascaded and can retry manually.
    await logAudit({ action: 'AGENT_SUSPEND', actor, target: agentId, result: 'FLAG' });
    return NextResponse.json({
      error: 'Agent suspended but failed to cascade tasks',
      agentId,
      cascadeError: true,
    }, { status: 500 });
  }

  const failedTasks = affectedTasks ?? [];

  await logAudit({ action: 'AGENT_SUSPEND', actor, target: agentId, result: 'ALLOW' });
  await logActivity({
    type: 'agent',
    message: `Agent suspended: ${agent.name} (${reason})`,
    userId: auth.session.userId,
  });

  for (const task of failedTasks) {
    await logActivity({
      type: 'payment',
      message: `Refund pending — task failed due to agent suspension: ${task.title} (${task.reward})`,
      userId: auth.session.userId,
    });
  }

  return NextResponse.json({
    success: true,
    agentId,
    suspendedAt,
    failedTaskCount: failedTasks.length,
    failedTaskIds: failedTasks.map((t) => t.id),
  });
}

/**
 * DELETE /api/admin/agents/[id]/suspend
 *
 * Unsuspend an agent (returns them to `offline` status so an owner must
 * explicitly bring them back online). Does not restore previously-failed
 * tasks — those remain in the refund flow.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id: agentId } = await params;
  const actor = auth.session.walletAddress ?? auth.session.userId;

  const supabase = createServiceClient();

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name, status')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.status !== 'suspended') {
    return NextResponse.json({ error: 'Agent is not suspended' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      status: 'offline',
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
    })
    .eq('id', agentId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to unsuspend agent' }, { status: 500 });
  }

  await logAudit({ action: 'AGENT_UNSUSPEND', actor, target: agentId, result: 'ALLOW' });
  await logActivity({
    type: 'agent',
    message: `Agent unsuspended: ${agent.name}`,
    userId: auth.session.userId,
  });

  return NextResponse.json({ success: true, agentId });
}
