import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTask } from '@/lib/transforms';
import { logAudit, logActivity, checkRateLimit } from '@/lib/audit';
import { validateOrigin } from '@/lib/csrf';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, agents(name)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(toTask(data));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
        actor: session.walletAddress ?? session.userId!,
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
  const actor = session.walletAddress ?? session.userId!;
  if (body.assignedAgent) {
    await logAudit({ action: 'TASK_ASSIGN', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task assigned to agent: ${data.agents?.name ?? body.assignedAgent}`, userId: session.userId });
  }
  if (body.status === 'completed') {
    await logAudit({ action: 'TASK_COMPLETE', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task completed: ${data.title}`, userId: session.userId });
  }
  if (body.currentStep && body.currentStep !== 'Complete') {
    await logAudit({ action: 'TASK_UPDATE', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task "${data.title}" moved to ${body.currentStep}`, userId: session.userId });
  }
  if (body.zkProofId) {
    await logAudit({ action: 'PROOF_SUBMIT', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'proof', message: `ZK proof submitted for task: ${data.title}`, userId: session.userId });
  }

  return NextResponse.json(toTask(data));
}
