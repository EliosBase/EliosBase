import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getConfiguredCronSecret, isProductionRuntime } from '@/lib/runtimeConfig';
import { timingSafeCompare } from '@/lib/authUtils';
import { createSecurityAlert, logActivity, logAudit } from '@/lib/audit';

/**
 * GET /api/cron/detect-timeouts — flag stuck active tasks and fail them.
 *
 * Each task step has a maximum age (see STEP_TIMEOUT_SECONDS). When an
 * active task's `step_changed_at` is older than its step's timeout, we:
 *   1. Mark the task status = 'failed' (terminal, no retries)
 *   2. Release its assigned agent (status → online)
 *   3. Create a security_alerts row describing the timeout
 *   4. Write a TASK_TIMEOUT audit entry and an activity event
 *
 * This is safe to run on a schedule (every 1–5 minutes). It is idempotent
 * in practice — once a task is failed it no longer matches the query.
 */

// Timeout per step, in seconds. Generous upper bounds so legitimate slow
// runs aren't killed, but ensure nothing can sit stuck forever.
export const STEP_TIMEOUT_SECONDS: Record<string, number> = {
  Submitted: 10 * 60, // 10 min — decomposition is near-instant
  Decomposed: 60 * 60, // 1 hour — waiting for agent hire
  Assigned: 15 * 60, // 15 min — should start executing promptly
  Executing: 30 * 60, // 30 min — long-running agent runs OK
  'ZK Verifying': 15 * 60, // 15 min — proof gen + chain submit
};

type StuckTask = {
  id: string;
  title: string;
  current_step: string;
  assigned_agent: string | null;
  step_changed_at: string | null;
  submitted_at: string;
};

function getStepTimeout(step: string): number | null {
  return STEP_TIMEOUT_SECONDS[step] ?? null;
}

function isAuthorized(req: NextRequest, cronSecret: string | undefined) {
  if (!cronSecret) return false;
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  return timingSafeCompare(authHeader, `Bearer ${cronSecret}`);
}

export async function GET(req: NextRequest) {
  const cronSecret = getConfiguredCronSecret();
  if (!cronSecret && isProductionRuntime()) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  if (cronSecret && !isAuthorized(req, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, current_step, assigned_agent, step_changed_at, submitted_at')
    .eq('status', 'active');

  if (error || !tasks) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  const now = Date.now();
  const timedOut: Array<{
    taskId: string;
    step: string;
    elapsedSeconds: number;
    timeoutSeconds: number;
  }> = [];

  for (const task of tasks as StuckTask[]) {
    const timeoutSeconds = getStepTimeout(task.current_step);
    if (timeoutSeconds == null) continue;

    const stepChangedAt = task.step_changed_at
      ? new Date(task.step_changed_at).getTime()
      : new Date(task.submitted_at).getTime();

    if (!Number.isFinite(stepChangedAt)) continue;

    const elapsedSeconds = Math.floor((now - stepChangedAt) / 1000);
    if (elapsedSeconds <= timeoutSeconds) continue;

    // Mark the task as failed terminally. The status guard on .eq('status', 'active')
    // prevents double-fail if another process already moved it.
    const failedAt = new Date(now).toISOString();
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'failed',
        step_changed_at: failedAt,
        execution_result: {
          status: 'failed',
          failure: {
            code: 'task_step_timeout',
            message: `Task exceeded ${timeoutSeconds}s timeout in step "${task.current_step}" (elapsed ${elapsedSeconds}s).`,
            retryable: false,
            failedAt,
            terminal: true,
            step: task.current_step,
            elapsedSeconds,
            timeoutSeconds,
          },
        },
      })
      .eq('id', task.id)
      .eq('status', 'active');

    if (updateError) {
      continue;
    }

    // Release the assigned agent so it's available for new work.
    if (task.assigned_agent) {
      await supabase
        .from('agents')
        .update({ status: 'online' })
        .eq('id', task.assigned_agent);
    }

    await createSecurityAlert({
      severity: 'high',
      title: 'Task timed out',
      description: `Task "${task.title}" has been stuck in step "${task.current_step}" for ${elapsedSeconds}s (timeout: ${timeoutSeconds}s). The task has been marked as failed and the assigned agent released.`,
      source: `Task Timeout · ${task.id}`,
      actor: 'cron',
    });

    await logAudit({
      action: 'TASK_TIMEOUT',
      actor: 'cron',
      target: `${task.id}:${task.current_step}`,
      result: 'FLAG',
    });

    await logActivity({
      type: 'task',
      message: `Task timed out in ${task.current_step}: ${task.title}`,
    });

    timedOut.push({
      taskId: task.id,
      step: task.current_step,
      elapsedSeconds,
      timeoutSeconds,
    });
  }

  return NextResponse.json({
    total: tasks.length,
    timedOut: timedOut.length,
    results: timedOut,
  });
}
