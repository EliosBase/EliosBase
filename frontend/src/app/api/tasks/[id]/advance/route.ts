import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { toTask } from '@/lib/transforms';
import { logAudit, logActivity, generateId } from '@/lib/audit';

// Step transition rules: [currentStep, nextStep, minSecondsElapsed]
const STEP_TRANSITIONS: [string, string, number][] = [
  ['Submitted', 'Decomposed', 30],
  // Decomposed → Assigned is NOT auto (requires agent hire)
  ['Assigned', 'Executing', 15],
  ['Executing', 'ZK Verifying', 60],
  ['ZK Verifying', 'Complete', 20],
];

// POST /api/tasks/[id]/advance — auto-advance a task to the next step if eligible
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: task, error } = await supabase
    .from('tasks')
    .select('*, agents(name)')
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status !== 'active') {
    return NextResponse.json({ advanced: false, reason: 'Task is not active' });
  }

  // Find the applicable transition
  const transition = STEP_TRANSITIONS.find(([from]) => from === task.current_step);
  if (!transition) {
    return NextResponse.json({ advanced: false, reason: `No auto-transition from ${task.current_step}` });
  }

  const [, nextStep, minSeconds] = transition;

  // Check elapsed time since step changed
  const stepChangedAt = task.step_changed_at
    ? new Date(task.step_changed_at).getTime()
    : new Date(task.submitted_at).getTime();
  const elapsed = (Date.now() - stepChangedAt) / 1000;

  if (elapsed < minSeconds) {
    return NextResponse.json({
      advanced: false,
      reason: `Need ${minSeconds}s, only ${Math.floor(elapsed)}s elapsed`,
      currentStep: task.current_step,
    });
  }

  // Advance the step
  const updates: Record<string, unknown> = {
    current_step: nextStep,
    step_changed_at: new Date().toISOString(),
  };

  // If completing the task
  if (nextStep === 'Complete') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
    updates.zk_proof_id = `zk-${generateId('proof')}`;
  }

  const { data: updated, error: updateError } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select('*, agents(name)')
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Failed to advance task' }, { status: 500 });
  }

  // Log the step transition
  const actor = 'orchestrator';
  await logAudit({ action: 'TASK_UPDATE', actor, target: `${id}:${nextStep}`, result: 'ALLOW' });
  await logActivity({ type: 'task', message: `Task "${updated.title}" advanced to ${nextStep}` });

  // If task completed, free the agent and log completion events
  if (nextStep === 'Complete') {
    await logAudit({ action: 'TASK_COMPLETE', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'task', message: `Task completed: ${updated.title}` });
    await logActivity({ type: 'proof', message: `ZK proof generated for: ${updated.title}` });

    // Set agent back to online
    if (updated.assigned_agent) {
      await supabase
        .from('agents')
        .update({ status: 'online' })
        .eq('id', updated.assigned_agent);

      await logActivity({ type: 'agent', message: `Agent available: ${updated.agents?.name ?? updated.assigned_agent}` });
    }
  }

  return NextResponse.json({
    advanced: true,
    previousStep: task.current_step,
    currentStep: nextStep,
    task: toTask(updated),
  });
}
