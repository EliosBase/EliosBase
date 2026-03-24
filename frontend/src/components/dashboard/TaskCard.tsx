'use client';

import { useState, useEffect } from 'react';
import ProofBadge from './ProofBadge';
import TaskResultModal from './TaskResultModal';
import { type Task } from '@/lib/types';
import { TASK_STEPS } from '@/lib/constants';
import { AlertTriangle, Bot, CheckCircle, Loader2 } from 'lucide-react';
import { useEscrowRelease } from '@/hooks/useEscrow';
import { useProofVerification } from '@/hooks/useProofVerification';
import { useQueryClient } from '@tanstack/react-query';

interface TaskCardProps {
  task: Task;
  isSubmitter?: boolean;
  canViewResult?: boolean;
}

type ReleaseStep = 'idle' | 'signing' | 'mining' | 'confirming' | 'released' | 'error';

export default function TaskCard({ task, isSubmitter, canViewResult }: TaskCardProps) {
  const currentStepIndex = TASK_STEPS.indexOf(task.currentStep);
  const queryClient = useQueryClient();
  const { release, txHash, isSigning, isMining, isConfirmed, error: contractError, reset } = useEscrowRelease();
  const [releaseStep, setReleaseStep] = useState<ReleaseStep>('idle');
  const [releaseError, setReleaseError] = useState('');
  const [showResult, setShowResult] = useState(false);
  const { isVerified: onChainVerified } = useProofVerification(task.id);

  const canRelease = isSubmitter && task.currentStep === 'Complete' && task.agentOperatorAddress && onChainVerified;
  const canOpenResult = !!canViewResult && !!task.hasExecutionResult && task.status === 'completed';
  const showsExecutionFailure = task.currentStep === 'Assigned' && !!task.executionFailureMessage;

  // Track release contract state
  useEffect(() => {
    if (isSigning && releaseStep === 'idle') setReleaseStep('signing');
    if (isMining && releaseStep === 'signing') setReleaseStep('mining');
  }, [isSigning, isMining, releaseStep]);

  // When release tx confirmed, call API
  useEffect(() => {
    if (isConfirmed && txHash && releaseStep === 'mining') {
      setReleaseStep('confirming');
      registerRelease(txHash);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  // Handle contract errors
  useEffect(() => {
    if (contractError && releaseStep !== 'idle' && releaseStep !== 'released') {
      setReleaseStep('error');
      const raw = contractError.message ?? '';
      let msg = 'Something went wrong. Please try again.';
      if (raw.includes('User rejected') || raw.includes('user rejected')) {
        msg = 'You cancelled the transaction.';
      } else if (raw.includes('reverted') || raw.includes('InvalidState')) {
        msg = 'Funds have already been released or refunded for this task.';
      } else if (raw.includes('NotAuthorized')) {
        msg = 'Only the task submitter can release funds.';
      } else if (raw.includes('insufficient funds') || raw.includes('exceeds balance')) {
        msg = 'Insufficient funds for gas fees.';
      } else if (raw.includes('chain') || raw.includes('network')) {
        msg = 'Please switch to Base network and try again.';
      }
      setReleaseError(msg);
    }
  }, [contractError, releaseStep]);

  function handleRelease() {
    if (!canRelease || (releaseStep !== 'idle' && releaseStep !== 'error')) return;
    setReleaseError('');
    setReleaseStep('idle');
    reset();
    release(task.id, task.agentOperatorAddress as `0x${string}`);
  }

  async function registerRelease(hash: string) {
    try {
      const res = await fetch(`/api/tasks/${task.id}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '' }));
        const apiErr = data.error || '';
        let msg = 'Failed to complete release. Please try again.';
        if (apiErr.includes('submitter')) msg = 'Only the task creator can release funds.';
        else if (apiErr.includes('completed')) msg = 'Task must be completed before releasing funds.';
        else if (apiErr.includes('not to the escrow')) msg = 'Transaction verification failed. Please try again.';
        setReleaseError(msg);
        setReleaseStep('error');
        return;
      }
      setReleaseStep('released');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch {
      setReleaseError('Network error. Check your connection and try again.');
      setReleaseStep('error');
    }
  }

  const proofStatus = onChainVerified
    ? 'verified' as const
    : task.currentStep === 'ZK Verifying'
      ? 'verifying' as const
      : task.status === 'completed'
        ? 'verifying' as const
        : 'pending' as const;

  const releaseLabel = {
    idle: 'Release Funds',
    signing: 'Sign Tx...',
    mining: 'Mining...',
    confirming: 'Confirming...',
    released: 'Released',
    error: 'Retry',
  }[releaseStep];

  return (
    <div className="glass p-5 rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
            {task.title}
          </h3>
          <p className="text-xs text-white/40 mt-0.5 font-[family-name:var(--font-body)]">
            {task.description}
          </p>
        </div>
        <ProofBadge status={proofStatus} proofId={task.zkProofId} />
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-0 my-4">
        {TASK_STEPS.map((step, i) => {
          const done = i <= currentStepIndex;
          const isCurrent = i === currentStepIndex;
          return (
            <div key={step} className="flex-1 flex items-center">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-3 h-3 rounded-full border-2 transition-all ${
                    done
                      ? isCurrent
                        ? 'bg-white border-white shadow-[0_0_8px_rgba(255,255,255,0.3)]'
                        : 'bg-white/40 border-white/40'
                      : 'bg-transparent border-white/15'
                  }`}
                />
                <p className={`text-[9px] mt-1.5 text-center leading-tight ${
                  done ? 'text-white/60' : 'text-white/20'
                }`}>
                  {step}
                </p>
              </div>
              {i < TASK_STEPS.length - 1 && (
                <div className={`h-px flex-1 -mt-4 ${
                  i < currentStepIndex ? 'bg-white/30' : 'bg-white/8'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {showsExecutionFailure && (
        <div className={`mb-4 rounded-2xl border px-3 py-3 ${
          task.executionFailureRetryable
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
            : 'border-red-500/25 bg-red-500/10 text-red-200'
        }`}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em]">
                {task.executionFailureRetryable ? 'Execution Retry Pending' : 'Execution Blocked'}
              </p>
              <p className="mt-1 text-xs leading-5">
                {task.executionFailureMessage}
              </p>
              <p className="mt-1 text-[11px] opacity-75">
                {task.executionFailureRetryable
                  ? 'The next advancement attempt can retry automatically once the upstream dependency recovers.'
                  : 'This task will not retry automatically until the agent configuration or runtime issue is fixed.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/6">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-white/40" />
          <span className="text-xs text-white/50 font-[family-name:var(--font-body)]">
            {task.assignedAgent}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {canOpenResult && (
            <button
              onClick={() => setShowResult(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/15 transition-colors"
            >
              View Result
            </button>
          )}
          {canRelease && (
            <button
              onClick={releaseStep === 'error' ? handleRelease : handleRelease}
              disabled={['signing', 'mining', 'confirming'].includes(releaseStep) || releaseStep === 'released'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                releaseStep === 'released'
                  ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                  : releaseStep === 'error'
                    ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
                    : 'bg-white text-black hover:bg-white/90'
              } disabled:opacity-70`}
            >
              {releaseStep === 'released' ? (
                <span className="flex items-center gap-1"><CheckCircle size={12} /> Released</span>
              ) : ['signing', 'mining', 'confirming'].includes(releaseStep) ? (
                <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {releaseLabel}</span>
              ) : (
                releaseLabel
              )}
            </button>
          )}
          <span className="text-sm font-medium text-white font-[family-name:var(--font-mono)]">
            {task.reward}
          </span>
        </div>
      </div>

      {releaseError && (
        <p className="text-[10px] text-red-400 mt-2">{releaseError}</p>
      )}

      {showResult && (
        <TaskResultModal
          taskId={task.id}
          taskTitle={task.title}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  );
}
