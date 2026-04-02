import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { toTask } from '@/lib/transforms';
import { logAudit, logActivity, checkRateLimit } from '@/lib/audit';
import { buildTaskDisputeSource } from '@/lib/taskDisputes';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data, error }, disputesRes] = await Promise.all([
    supabase
    .from('tasks')
      .select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address))')
      .eq('id', id)
      .single(),
    supabase
      .from('security_alerts')
      .select('id')
      .eq('source', buildTaskDisputeSource(id))
      .eq('resolved', false),
  ]);

  if (error || !data) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(toTask({
    ...data,
    has_open_dispute: (disputesRes.data ?? []).length > 0,
  }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (body.currentStep) {
    updates.current_step = body.currentStep;
    updates.step_changed_at = new Date().toISOString();
  }
  if (body.status) updates.status = body.status;
  if (body.assignedAgent) {
    updates.assigned_agent = body.assignedAgent;
    updates.step_changed_at = new Date().toISOString();
  }
  if (body.completedAt) updates.completed_at = body.completedAt;
  if (body.zkProofId) updates.zk_proof_id = body.zkProofId;

  // Guardrail: rate limit check when assigning an agent
  if (body.assignedAgent) {
    const { allowed } = await checkRateLimit(body.assignedAgent);
    if (!allowed) {
      await logAudit({
        action: 'RATE_LIMIT',
        actor: auth.session.walletAddress ?? auth.session.userId,
        target: `agent:${body.assignedAgent}`,
        result: 'DENY',
      });
      return NextResponse.json(
        { error: 'Agent has exceeded rate limit' },
        { status: 429 }
      );
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select('*, agents(name)')
    .single();

  if (error || !data) {
    const status = error ? 500 : 404;
    return NextResponse.json({ error: error ? 'Failed to update task' : 'Task not found' }, { status });
  }

  // Determine audit action based on what changed
  const actor = auth.session.walletAddress ?? auth.session.userId;
  if (body.assignedAgent) {
    await logAudit({ action: 'TASK_ASSIGN', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task assigned to agent: ${data.agents?.name ?? body.assignedAgent}`, userId: auth.session.userId });
  }
  if (body.status === 'completed') {
    await logAudit({ action: 'TASK_COMPLETE', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task completed: ${data.title}`, userId: auth.session.userId });
  }
  if (body.currentStep && body.currentStep !== 'Complete') {
    await logAudit({ action: 'TASK_UPDATE', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task "${data.title}" moved to ${body.currentStep}`, userId: auth.session.userId });
  }
  if (body.zkProofId) {
    await logAudit({ action: 'PROOF_SUBMIT', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'proof', message: `ZK proof submitted for task: ${data.title}`, userId: auth.session.userId });
  }

  return NextResponse.json(toTask(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Verify the task belongs to this user and is deletable
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('id, submitter_id, status, current_step')
    .eq('id', id)
    .single();

  if (fetchError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.submitter_id !== session.userId && session.role !== 'admin') {
    return NextResponse.json({ error: 'Only the task creator can delete this task' }, { status: 403 });
  }

  // Only allow deleting tasks that haven't locked escrow
  if (task.current_step !== 'Submitted' && task.current_step !== 'Decomposed') {
    return NextResponse.json({ error: 'Cannot delete a task that has been assigned or has locked escrow' }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }

  await logAudit({ action: 'TASK_DELETE', actor: session.walletAddress ?? session.userId, target: id, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Task deleted: ${id}` });

  return NextResponse.json({ deleted: true });
}
