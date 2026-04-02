import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { createSecurityAlert, logActivity, logAudit } from '@/lib/audit';
import { validateOrigin } from '@/lib/csrf';
import { buildTaskDisputeSource } from '@/lib/taskDisputes';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { taskDisputeSchema } from '@/lib/schemas/task';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.walletMutation);
  if (rateLimitError) return rateLimitError;

  const { id: taskId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = taskDisputeSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const { reason } = parsed.data;

  const supabase = createServiceClient();
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, submitter_id')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.submitter_id !== session.userId) {
    return NextResponse.json({ error: 'Only the task submitter can open a dispute' }, { status: 403 });
  }

  const source = buildTaskDisputeSource(taskId);
  const { data: existingDisputes } = await supabase
    .from('security_alerts')
    .select('id')
    .eq('source', source)
    .eq('resolved', false);

  if ((existingDisputes ?? []).length > 0) {
    return NextResponse.json({ error: 'A dispute is already open for this task' }, { status: 409 });
  }

  const actor = session.walletAddress ?? session.userId;
  const { id: alertId, error } = await createSecurityAlert({
    severity: 'medium',
    title: `Dispute opened for ${task.title}`,
    description: reason,
    source,
    actor,
  });

  if (error) {
    return NextResponse.json({ error: 'Failed to open dispute' }, { status: 500 });
  }

  await logAudit({
    action: 'TASK_DISPUTE',
    actor,
    target: taskId,
    result: 'FLAG',
  });
  await logActivity({
    type: 'task',
    message: `Dispute opened for task: ${task.title}`,
    userId: session.userId,
  });

  return NextResponse.json({
    success: true,
    alertId,
    taskId,
    hasOpenDispute: true,
  }, { status: 201 });
}
