import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTask } from '@/lib/transforms';
import { logAudit, logActivity } from '@/lib/audit';
import { validateOrigin } from '@/lib/csrf';
import { AgentExecutionError, DEFAULT_AGENT_EXECUTION_MODEL, executeAgentTask, serializeExecutionResult } from '@/lib/agentExecutor';
import { generateTaskProof } from '@/lib/zkProof';
import { submitProofOnChain } from '@/lib/proofSubmitter';
import { getExecutionFailure, getExecutionResult } from '@/lib/types';

// Step transition rules: [currentStep, nextStep, minSecondsElapsed]
const STEP_TRANSITIONS: [string, string, number][] = [
  ['Submitted', 'Decomposed', 30],
  // Decomposed → Assigned is NOT auto (requires agent hire)
  ['Assigned', 'Executing', 15],
  ['Executing', 'ZK Verifying', 60],
  ['ZK Verifying', 'Complete', 20],
];

function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

// POST /api/tasks/[id]/advance — auto-advance a task to the next step if eligible
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cronAuthorized = isCronAuthorized(req);
  const session = cronAuthorized ? null : await getSession();

  if (!cronAuthorized) {
    const csrfError = validateOrigin(req);
    if (csrfError) return csrfError;

    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  const { data: task, error } = await supabase
    .from('tasks')
    .select('*, agents(name, type, description, capabilities)')
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status !== 'active') {
    return NextResponse.json({ advanced: false, reason: 'Task is not active' });
  }

  if (!cronAuthorized) {
    const canAdvance = session?.role === 'admin' || task.submitter_id === session?.userId;
    if (!canAdvance) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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

  const actor = session?.walletAddress ?? session?.userId ?? 'cron';

  if (nextStep === 'Executing') {
    const agentType = task.agents?.type;
    const agentDescription = task.agents?.description;
    const agentCapabilities = task.agents?.capabilities;

    if (!task.assigned_agent || !task.agents?.name || !agentType || !agentDescription || !Array.isArray(agentCapabilities) || agentCapabilities.length === 0) {
      return NextResponse.json({
        advanced: false,
        reason: 'Assigned agent metadata is incomplete',
        currentStep: task.current_step,
      });
    }

    const existingFailure = getExecutionFailure(task.execution_result);
    if (existingFailure && !existingFailure.retryable) {
      return NextResponse.json({
        advanced: false,
        reason: existingFailure.message,
        currentStep: task.current_step,
        retryable: false,
      });
    }

    const claimedAt = new Date().toISOString();
    const { data: claimedTask, error: claimError } = await supabase
      .from('tasks')
      .update({
        current_step: 'Executing',
        step_changed_at: claimedAt,
        execution_result: {
          status: 'running',
          startedAt: claimedAt,
          model: DEFAULT_AGENT_EXECUTION_MODEL,
          agentType,
          capabilities: agentCapabilities,
        },
      })
      .eq('id', id)
      .eq('current_step', 'Assigned')
      .select('*, agents(name, type, description, capabilities)')
      .single();

    if (claimError || !claimedTask) {
      return NextResponse.json({
        advanced: false,
        reason: 'Task execution is already in progress',
        currentStep: task.current_step,
      });
    }

    try {
      const executionResult = await executeAgentTask(
        {
          id: claimedTask.id,
          title: claimedTask.title,
          description: claimedTask.description,
          reward: claimedTask.reward,
        },
        {
          id: claimedTask.assigned_agent!,
          name: claimedTask.agents!.name,
          type: claimedTask.agents!.type!,
          description: claimedTask.agents!.description!,
          capabilities: claimedTask.agents!.capabilities!,
        },
      );

      const { data: updated, error: updateError } = await supabase
        .from('tasks')
        .update({
          execution_result: {
            status: 'succeeded',
            completedAt: new Date().toISOString(),
            result: executionResult,
          },
        })
        .eq('id', id)
        .eq('current_step', 'Executing')
        .select('*, agents(name)')
        .single();

      if (updateError || !updated) {
        await supabase
          .from('tasks')
          .update({
            current_step: 'Assigned',
            step_changed_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('current_step', 'Executing');

        return NextResponse.json({ error: 'Failed to persist execution result' }, { status: 500 });
      }

      await logAudit({ action: 'AGENT_EXECUTE', actor, target: id, result: 'ALLOW' });
      await logAudit({ action: 'TASK_UPDATE', actor, target: `${id}:Executing`, result: 'ALLOW' });
      await logActivity({ type: 'task', message: `Task "${updated.title}" advanced to Executing` });
      await logActivity({ type: 'task', message: `Agent result generated for task: ${updated.title}` });

      return NextResponse.json({
        advanced: true,
        previousStep: task.current_step,
        currentStep: 'Executing',
        task: toTask(updated),
      });
    } catch (executionError) {
      const failure = executionError instanceof AgentExecutionError
        ? executionError
        : new AgentExecutionError(
            executionError instanceof Error ? executionError.message : 'Agent execution failed',
            { code: 'agent_execution_failed', retryable: false, cause: executionError },
          );

      await supabase
        .from('tasks')
        .update({
          current_step: 'Assigned',
          step_changed_at: new Date().toISOString(),
          execution_result: {
            status: 'failed',
            failure: {
              code: failure.code,
              message: failure.message,
              retryable: failure.retryable,
              failedAt: new Date().toISOString(),
              model: DEFAULT_AGENT_EXECUTION_MODEL,
              agentType,
            },
          },
        })
        .eq('id', id)
        .eq('current_step', 'Executing');

      await logAudit({ action: 'AGENT_EXECUTE', actor, target: id, result: 'FLAG' });
      await logActivity({ type: 'task', message: `Agent execution failed for task: ${task.title}` });

      return NextResponse.json({
        advanced: false,
        reason: failure.message,
        currentStep: 'Assigned',
        retryable: failure.retryable,
      });
    }
  }

  const executionResult = getExecutionResult(task.execution_result);

  if (nextStep === 'ZK Verifying' && !executionResult) {
    return NextResponse.json({
      advanced: false,
      reason: 'Task execution has not completed successfully',
      currentStep: task.current_step,
    });
  }

  const updates: Record<string, unknown> = {
    current_step: nextStep,
    step_changed_at: new Date().toISOString(),
  };

  if (nextStep === 'Complete') {
    if (task.zk_verify_tx_hash) {
      updates.status = 'completed';
      updates.completed_at = task.completed_at ?? new Date().toISOString();
      updates.zk_proof_id = task.zk_proof_id ?? task.zk_verify_tx_hash;
      updates.zk_verify_tx_hash = task.zk_verify_tx_hash;
      updates.zk_commitment = task.zk_commitment;
    } else if (!executionResult) {
      return NextResponse.json({
        advanced: false,
        reason: 'Task execution has not completed successfully',
        currentStep: task.current_step,
      });
    } else {
      try {
        const resultData = serializeExecutionResult(executionResult);
        const proofResult = await generateTaskProof(id, task.assigned_agent ?? '', resultData);

        const verifyTxHash = await submitProofOnChain(id, proofResult);

        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
        updates.zk_proof_id = verifyTxHash;
        updates.zk_commitment = proofResult.commitment;
        updates.zk_verify_tx_hash = verifyTxHash;
      } catch (err) {
        // If proof generation/submission fails, stay at ZK Verifying step
        console.error('ZK proof failed:', err);
        return NextResponse.json({
          advanced: false,
          reason: 'ZK proof generation or on-chain verification failed',
          currentStep: task.current_step,
        });
      }
    }
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
