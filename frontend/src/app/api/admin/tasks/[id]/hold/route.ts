import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { createServiceClient } from '@/lib/supabase/server';
import { logAudit, logActivity } from '@/lib/audit';

/**
 * POST /api/admin/tasks/[id]/hold
 * Put a task on operator hold — prevents auto-advancement by cron.
 * The original step is preserved in execution_result.heldFromStep
 * so it can be restored when released.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const actor = auth.session.userId;
  const supabase = createServiceClient();

  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, title, current_step, status, execution_result')
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status === 'completed') {
    return NextResponse.json({ error: 'Cannot hold a completed task' }, { status: 400 });
  }

  if (task.current_step === 'Hold') {
    return NextResponse.json({ error: 'Task is already on hold' }, { status: 400 });
  }

  const executionResult = typeof task.execution_result === 'object' && task.execution_result !== null
    ? task.execution_result as Record<string, unknown>
    : {};

  await supabase
    .from('tasks')
    .update({
      current_step: 'Hold',
      step_changed_at: new Date().toISOString(),
      execution_result: {
        ...executionResult,
        heldFromStep: task.current_step,
        heldAt: new Date().toISOString(),
        heldBy: actor,
      },
    })
    .eq('id', id);

  await logAudit({ action: 'TASK_UPDATE', actor, target: `${id}:hold`, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Operator put task on hold: ${task.title}` });

  return NextResponse.json({ success: true, taskId: id, previousStep: task.current_step });
}

/**
 * DELETE /api/admin/tasks/[id]/hold
 * Release a task from operator hold — restores the original step.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const actor = auth.session.userId;
  const supabase = createServiceClient();

  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, title, current_step, execution_result')
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.current_step !== 'Hold') {
    return NextResponse.json({ error: 'Task is not on hold' }, { status: 400 });
  }

  const executionResult = typeof task.execution_result === 'object' && task.execution_result !== null
    ? task.execution_result as Record<string, unknown>
    : {};

  const restoreStep = typeof executionResult.heldFromStep === 'string'
    ? executionResult.heldFromStep
    : 'Assigned';

  const { heldFromStep: _held, heldAt: _at, heldBy: _by, ...cleanResult } = executionResult;
  void _held; void _at; void _by;

  await supabase
    .from('tasks')
    .update({
      current_step: restoreStep,
      step_changed_at: new Date().toISOString(),
      execution_result: Object.keys(cleanResult).length > 0 ? cleanResult : null,
    })
    .eq('id', id);

  await logAudit({ action: 'TASK_UPDATE', actor, target: `${id}:release`, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Operator released task from hold: ${task.title}` });

  return NextResponse.json({ success: true, taskId: id, restoredStep: restoreStep });
}
