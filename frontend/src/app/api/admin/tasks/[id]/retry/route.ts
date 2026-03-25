import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';

// POST /api/admin/tasks/[id]/retry — manually retry a failed task execution
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id: taskId } = await params;
  const supabase = createServiceClient();
  const actor = auth.session.walletAddress ?? auth.session.userId;

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Cannot retry a completed task' }, { status: 400 });
  }

  if (!task.assigned_agent) {
    return NextResponse.json({ error: 'Task has no assigned agent to retry with' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'active',
      current_step: 'Assigned',
      execution_result: null,
      step_changed_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }

  await logAudit({ action: 'TASK_RETRY', actor, target: taskId, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Admin retried task: ${task.title}`, userId: auth.session.userId });

  return NextResponse.json({ success: true, taskId });
}
