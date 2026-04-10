import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

// POST /api/admin/tasks/[id]/reassign — reassign a task to a different agent
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id: taskId } = await params;
  const actor = auth.session.walletAddress ?? auth.session.userId;

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.adminMutation, actor);
  if (rateLimitError) return rateLimitError;

  const body = await req.json();
  const { agentId } = body;

  if (!agentId || typeof agentId !== 'string') {
    return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Cannot reassign a completed task' }, { status: 400 });
  }

  const { data: newAgent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentError || !newAgent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (newAgent.status === 'busy') {
    return NextResponse.json({ error: 'Agent is already busy' }, { status: 409 });
  }

  // Release old agent if present
  if (task.assigned_agent) {
    await supabase
      .from('agents')
      .update({ status: 'online' })
      .eq('id', task.assigned_agent);
  }

  // Assign new agent
  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      assigned_agent: agentId,
      status: 'active',
      current_step: 'Assigned',
      execution_result: null,
      step_changed_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to reassign task' }, { status: 500 });
  }

  await supabase
    .from('agents')
    .update({ status: 'busy' })
    .eq('id', agentId);

  await logAudit({ action: 'TASK_REASSIGN', actor, target: `${taskId} → ${agentId}`, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Admin reassigned task "${task.title}" to ${newAgent.name}`, userId: auth.session.userId });

  return NextResponse.json({ success: true, taskId, newAgentId: agentId });
}
