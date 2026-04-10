import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';
import { getTaskIdFromDisputeSource } from '@/lib/taskDisputes';

const resolveSchema = z.object({
  resolution: z.enum(['refund', 'release', 'dismiss']),
  notes: z.string().max(1000).optional(),
});

/**
 * POST /api/admin/disputes/[alertId]/resolve
 *
 * Admin/operator endpoint to resolve a task dispute. The dispute is
 * represented as an unresolved `security_alerts` row whose `source`
 * encodes the task id via `buildTaskDisputeSource`.
 *
 * Resolutions:
 * - `refund`  → task marked as `failed` (submitter recovers escrow off-chain)
 * - `release` → task marked as `completed` (agent is paid off-chain)
 * - `dismiss` → dispute closed, task status unchanged
 *
 * This is an off-chain-first flow. The on-chain refund/release tx is
 * triggered separately via existing escrow routes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { alertId } = await params;
  const actor = auth.session.walletAddress ?? auth.session.userId;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = resolveSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const { resolution, notes } = parsed.data;

  const supabase = createServiceClient();

  const { data: alert, error: alertError } = await supabase
    .from('security_alerts')
    .select('id, title, source, resolved')
    .eq('id', alertId)
    .single();

  if (alertError || !alert) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const taskId = getTaskIdFromDisputeSource(alert.source);
  if (!taskId) {
    return NextResponse.json({ error: 'Alert is not a task dispute' }, { status: 400 });
  }

  if (alert.resolved) {
    return NextResponse.json({ error: 'Dispute is already resolved' }, { status: 409 });
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, status')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const resolvedAt = new Date().toISOString();

  // Apply task-side effects first so that we don't mark a dispute
  // resolved against a task we failed to update.
  if (resolution === 'refund' || resolution === 'release') {
    const nextStatus = resolution === 'refund' ? 'failed' : 'completed';

    if (task.status === 'completed' && resolution === 'refund') {
      return NextResponse.json({
        error: 'Cannot refund a completed task — use a manual escrow reversal',
      }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      step_changed_at: resolvedAt,
    };
    if (nextStatus === 'completed') {
      updates.completed_at = resolvedAt;
      updates.current_step = 'Complete';
    }

    const { error: taskUpdateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId);

    if (taskUpdateError) {
      return NextResponse.json({
        error: 'Failed to update task status',
      }, { status: 500 });
    }
  }

  const { error: alertUpdateError } = await supabase
    .from('security_alerts')
    .update({
      resolved: true,
      resolution,
      resolution_notes: notes ?? null,
      resolved_at: resolvedAt,
      resolved_by: actor,
    })
    .eq('id', alertId);

  if (alertUpdateError) {
    return NextResponse.json({
      error: 'Failed to mark dispute resolved',
    }, { status: 500 });
  }

  await logAudit({
    action: 'DISPUTE_RESOLVE',
    actor,
    target: `${alertId}:${resolution}`,
    result: 'ALLOW',
  });
  await logAudit({
    action: 'ALERT_RESOLVE',
    actor,
    target: alertId,
    result: 'ALLOW',
  });

  const humanMessage =
    resolution === 'refund'
      ? `Dispute resolved (refund): ${task.title}`
      : resolution === 'release'
        ? `Dispute resolved (release): ${task.title}`
        : `Dispute dismissed: ${task.title}`;

  await logActivity({
    type: 'security',
    message: humanMessage,
    userId: auth.session.userId,
  });

  if (resolution === 'refund') {
    await logActivity({
      type: 'payment',
      message: `Refund pending for disputed task: ${task.title}`,
      userId: auth.session.userId,
    });
  }

  return NextResponse.json({
    success: true,
    alertId,
    taskId,
    resolution,
    taskStatus:
      resolution === 'refund' ? 'failed'
        : resolution === 'release' ? 'completed'
          : task.status,
  });
}
