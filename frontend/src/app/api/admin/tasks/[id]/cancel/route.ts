import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

// POST /api/admin/tasks/[id]/cancel — cancel a task and flag for refund
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id: taskId } = await params;
  const supabase = createServiceClient();
  const actor = auth.session.walletAddress ?? auth.session.userId;

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.adminMutation, actor);
  if (rateLimitError) return rateLimitError;

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Cannot cancel a completed task' }, { status: 400 });
  }

  // Release assigned agent
  if (task.assigned_agent) {
    await supabase
      .from('agents')
      .update({ status: 'online' })
      .eq('id', task.assigned_agent);
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'failed',
      step_changed_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to cancel task' }, { status: 500 });
  }

  await logAudit({ action: 'TASK_CANCEL', actor, target: taskId, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Admin cancelled task: ${task.title}`, userId: auth.session.userId });
  await logActivity({ type: 'payment', message: `Refund pending for cancelled task: ${task.title} (${task.reward})`, userId: auth.session.userId });

  return NextResponse.json({ success: true, taskId, refundPending: true });
}
