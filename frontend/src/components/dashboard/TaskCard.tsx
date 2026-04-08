'use client';

import { useEffect, useRef, useState } from 'react';
import ProofBadge from './ProofBadge';
import TaskResultModal from './TaskResultModal';
import { type Task } from '@/lib/types';
import { TASK_STEPS } from '@/lib/constants';
import { AlertTriangle, Bot, CheckCircle, Loader2 } from 'lucide-react';
import ShareToWarpcast from './ShareToWarpcast';
import { useEscrowRefund, useEscrowRelease, useEscrowStatus } from '@/hooks/useEscrow';
import { useProofVerification } from '@/hooks/useProofVerification';
import { useQueryClient } from '@tanstack/react-query';

interface TaskCardProps {
  task: Task;
  isSubmitter?: boolean;
  canViewResult?: boolean;
}

type EscrowActionStep = 'idle' | 'signing' | 'mining' | 'confirming' | 'released' | 'refunded' | 'error';

export default function TaskCard({ task, isSubmitter, canViewResult }: TaskCardProps) {
  const currentStepIndex = TASK_STEPS.indexOf(task.currentStep);
  const queryClient = useQueryClient();
  const { release, txHash, isSigning, isMining, isConfirmed, error: contractError, reset } = useEscrowRelease();
  const {
    refundFunds,
    txHash: refundTxHash,
    isSigning: isRefundSigning,
    isMining: isRefundMining,
    isConfirmed: isRefundConfirmed,
    error: refundContractError,
    reset: resetRefund,
  } = useEscrowRefund();
  const { state: escrowState } = useEscrowStatus(task.id);
  const [releaseStep, setReleaseStep] = useState<EscrowActionStep>('idle');
  const [releaseError, setReleaseError] = useState('');
  const [refundStep, setRefundStep] = useState<EscrowActionStep>('idle');
  const [refundError, setRefundError] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isDisputeComposerOpen, setIsDisputeComposerOpen] = useState(false);
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [disputeError, setDisputeError] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeOpened, setDisputeOpened] = useState(false);
  const submittedReleaseHash = useRef<`0x${string}` | null>(null);
  const submittedRefundHash = useRef<`0x${string}` | null>(null);
  const { isVerified: onChainVerified } = useProofVerification(task.id);

  const hasOpenDispute = task.hasOpenDispute || disputeOpened;
  const isEscrowLocked = escrowState === 'Locked';
  const isEscrowReleased = escrowState === 'Released' || releaseStep === 'released';
  const isEscrowRefunded = escrowState === 'Refunded' || refundStep === 'refunded';
  const canRelease = isSubmitter
    && !hasOpenDispute
    && isEscrowLocked
    && task.currentStep === 'Complete'
    && task.agentPayoutAddress
    && onChainVerified;
  const canRefund = isSubmitter
    && isEscrowLocked
    && (task.status === 'failed' || hasOpenDispute);
  const canDispute = isSubmitter
    && isEscrowLocked
    && !hasOpenDispute
    && task.status !== 'failed'
    && !isEscrowReleased
    && !isEscrowRefunded;
  const canOpenResult = !!canViewResult && !!task.hasExecutionResult && task.status === 'completed';
  const showsExecutionFailure = (task.currentStep === 'Assigned' || task.status === 'failed') && !!task.executionFailureMessage;
  const isTerminalExecutionFailure = task.status === 'failed' && showsExecutionFailure;

  // Track release contract state
  useEffect(() => {
    if (isSigning && releaseStep === 'idle') setReleaseStep('signing');
    if (isMining && releaseStep === 'signing') setReleaseStep('mining');
  }, [isSigning, isMining, releaseStep]);

  useEffect(() => {
    if (isRefundSigning && refundStep === 'idle') setRefundStep('signing');
    if (isRefundMining && refundStep === 'signing') setRefundStep('mining');
  }, [isRefundSigning, isRefundMining, refundStep]);

  useEffect(() => {
    if (!txHash || !isConfirmed || submittedReleaseHash.current === txHash) {
      return;
    }

    submittedReleaseHash.current = txHash;
    setReleaseStep('confirming');
    registerRelease(txHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  useEffect(() => {
    if (!refundTxHash || !isRefundConfirmed || submittedRefundHash.current === refundTxHash) {
      return;
    }

    submittedRefundHash.current = refundTxHash;
    setRefundStep('confirming');
    registerRefund(refundTxHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefundConfirmed, refundTxHash]);

  // Handle contract errors
  useEffect(() => {
    if (contractError && releaseStep !== 'idle' && releaseStep !== 'released') {
      setReleaseStep('error');
      setReleaseError(getEscrowErrorMessage(contractError.message, {
        invalidState: 'Funds have already been released or refunded for this task.',
        unauthorized: 'Only the task submitter can release funds.',
      }));
    }
  }, [contractError, releaseStep]);

  useEffect(() => {
    if (refundContractError && refundStep !== 'idle' && refundStep !== 'refunded') {
      setRefundStep('error');
      setRefundError(getEscrowErrorMessage(refundContractError.message, {
        invalidState: 'Escrow is no longer locked for this task.',
        unauthorized: 'Only the task submitter can refund escrow.',
      }));
    }
  }, [refundContractError, refundStep]);

  function handleRelease() {
    if (!canRelease || (releaseStep !== 'idle' && releaseStep !== 'error')) return;
    setReleaseError('');
    setReleaseStep('idle');
    submittedReleaseHash.current = null;
    reset();
    release(task.id, task.agentPayoutAddress as `0x${string}`);
  }

  function handleRefund() {
    if (!canRefund || (refundStep !== 'idle' && refundStep !== 'error')) return;
    setRefundError('');
    setRefundStep('idle');
    submittedRefundHash.current = null;
    resetRefund();
    refundFunds(task.id);
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

  async function registerRefund(hash: string) {
    try {
      const res = await fetch(`/api/tasks/${task.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '' }));
        const apiErr = data.error || '';
        let msg = 'Failed to complete refund. Please try again.';
        if (apiErr.includes('submitter')) msg = 'Only the task creator can refund escrow.';
        else if (apiErr.includes('failed or under dispute')) msg = 'Open a dispute or wait for the task to fail before refunding escrow.';
        else if (apiErr.includes('not to the escrow')) msg = 'Transaction verification failed. Please try again.';
        setRefundError(msg);
        setRefundStep('error');
        return;
      }
      setRefundStep('refunded');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['security-stats'] });
    } catch {
      setRefundError('Network error. Check your connection and try again.');
      setRefundStep('error');
    }
  }

  async function handleDisputeSubmit() {
    if (!canDispute || isSubmittingDispute) return;

    const reason = disputeReason.trim();
    if (reason.length < 10) {
      setDisputeError('Explain the issue in at least 10 characters.');
      return;
    }

    setIsSubmittingDispute(true);
    setDisputeError('');

    try {
      const res = await fetch(`/api/tasks/${task.id}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '' }));
        setDisputeError(data.error || 'Failed to open dispute');
        return;
      }

      setDisputeOpened(true);
      setDisputeReason('');
      setIsDisputeComposerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['security-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch {
      setDisputeError('Network error. Check your connection and try again.');
    } finally {
      setIsSubmittingDispute(false);
    }
  }

  const proofStatus = onChainVerified
    ? 'verified' as const
    : task.status === 'failed'
      ? 'failed' as const
    : task.currentStep === 'ZK Verifying'
      ? 'verifying' as const
      : task.status === 'completed'
        ? 'verifying' as const
        : 'pending' as const;

  const releaseLabels: Record<EscrowActionStep, string> = {
    idle: 'Release Funds',
    signing: 'Sign Tx...',
    mining: 'Mining...',
    confirming: 'Confirming...',
    released: 'Released',
    refunded: 'Released',
    error: 'Retry',
  };

  const refundLabels: Record<EscrowActionStep, string> = {
    idle: 'Refund Escrow',
    signing: 'Sign Tx...',
    mining: 'Mining...',
    confirming: 'Confirming...',
    released: 'Refund Escrow',
    refunded: 'Refunded',
    error: 'Retry',
  };
  const releaseLabel = releaseLabels[releaseStep];
  const refundLabel = refundLabels[refundStep];

  return (
    <div className="glass p-5 rounded-2xl">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] break-words">
            {task.title}
          </h3>
          <p className="text-xs text-white/40 mt-0.5 font-[family-name:var(--font-body)]">
            {task.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasOpenDispute ? (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-300">
              Dispute Open
            </span>
          ) : null}
          {isEscrowRefunded ? (
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-300">
              Escrow Refunded
            </span>
          ) : null}
          {isEscrowReleased ? (
            <span className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-green-300">
              Funds Released
            </span>
          ) : null}
          <ProofBadge status={proofStatus} proofId={task.zkProofId} />
        </div>
      </div>

      {/* Timeline */}
      <div className="my-4 hidden items-center gap-0 sm:flex">
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
      <div className="my-4 grid grid-cols-2 gap-2 sm:hidden">
        {TASK_STEPS.map((step, i) => {
          const done = i <= currentStepIndex;
          const isCurrent = i === currentStepIndex;

          return (
            <div
              key={step}
              className={`rounded-xl border px-3 py-2 ${
                done
                  ? isCurrent
                    ? 'border-white/25 bg-white/8'
                    : 'border-white/10 bg-white/4'
                  : 'border-white/6 bg-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full border ${
                    done
                      ? isCurrent
                        ? 'border-white bg-white'
                        : 'border-white/40 bg-white/40'
                      : 'border-white/15 bg-transparent'
                  }`}
                />
                <p className={`text-[10px] uppercase tracking-[0.16em] ${done ? 'text-white/60' : 'text-white/25'}`}>
                  Step {i + 1}
                </p>
              </div>
              <p className={`mt-2 text-xs leading-5 ${done ? 'text-white/75' : 'text-white/35'}`}>{step}</p>
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
                {task.executionFailureRetryable
                  ? 'Execution Retry Pending'
                  : isTerminalExecutionFailure
                    ? 'Execution Failed'
                    : 'Execution Blocked'}
              </p>
              <p className="mt-1 text-xs leading-5">
                {task.executionFailureMessage}
              </p>
              <p className="mt-1 text-[11px] opacity-75">
                {task.executionFailureRetryable
                  ? 'The next advancement attempt can retry automatically once the upstream dependency recovers.'
                  : isTerminalExecutionFailure
                    ? 'Automatic retries have stopped for this task and an operator alert has been raised for manual intervention.'
                    : 'This task will not retry automatically until the agent configuration or runtime issue is fixed.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isDisputeComposerOpen ? (
        <div className="mb-4 rounded-2xl border border-white/8 bg-white/3 p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Open Dispute
          </p>
          <textarea
            value={disputeReason}
            onChange={(event) => setDisputeReason(event.target.value)}
            rows={4}
            placeholder="Describe what went wrong and why the task should be reviewed."
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25"
          />
          {disputeError ? (
            <p className="mt-2 text-[11px] text-red-400">{disputeError}</p>
          ) : null}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={() => {
                setIsDisputeComposerOpen(false);
                setDisputeError('');
              }}
              className="min-h-10 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/12"
            >
              Cancel
            </button>
            <button
              onClick={handleDisputeSubmit}
              disabled={isSubmittingDispute}
              className="min-h-10 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-amber-200 disabled:opacity-70"
            >
              {isSubmittingDispute ? 'Submitting...' : 'Submit Dispute'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-white/6 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-white/40" />
          <span className="text-xs text-white/50 font-[family-name:var(--font-body)]">
            {task.assignedAgent}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {canOpenResult && (
            <button
              onClick={() => setShowResult(true)}
              className="min-h-10 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
            >
              View Result
            </button>
          )}
          {canDispute && (
            <button
              onClick={() => {
                setIsDisputeComposerOpen(true);
                setDisputeError('');
              }}
              className="min-h-10 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/25"
            >
              Open Dispute
            </button>
          )}
          {canRefund && (
            <button
              onClick={handleRefund}
              disabled={['signing', 'mining', 'confirming'].includes(refundStep) || refundStep === 'refunded'}
              className={`min-h-10 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                refundStep === 'refunded'
                  ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                  : refundStep === 'error'
                    ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
                    : 'bg-amber-300 text-black hover:bg-amber-200'
              } disabled:opacity-70`}
            >
              {refundStep === 'refunded' ? (
                <span className="flex items-center gap-1"><CheckCircle size={12} /> Refunded</span>
              ) : ['signing', 'mining', 'confirming'].includes(refundStep) ? (
                <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {refundLabel}</span>
              ) : (
                refundLabel
              )}
            </button>
          )}
          {canRelease && (
            <button
              onClick={handleRelease}
              disabled={['signing', 'mining', 'confirming'].includes(releaseStep) || releaseStep === 'released'}
              className={`min-h-10 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
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
          {task.status === 'completed' && (
              <ShareToWarpcast
                text={`Task completed on EliosBase: "${task.title}" — verified with ZK proof on Base`}
                embedUrl={typeof window !== 'undefined' ? `${window.location.origin}/app/tasks` : undefined}
              />
          )}
        </div>
      </div>

      {releaseError && (
        <p className="text-[10px] text-red-400 mt-2">{releaseError}</p>
      )}
      {refundError && (
        <p className="text-[10px] text-red-400 mt-2">{refundError}</p>
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

function getEscrowErrorMessage(
  rawMessage: string | undefined,
  overrides: {
    invalidState: string;
    unauthorized: string;
  },
) {
  const raw = rawMessage ?? '';
  if (raw.includes('User rejected') || raw.includes('user rejected')) {
    return 'You cancelled the transaction.';
  }
  if (raw.includes('reverted') || raw.includes('InvalidState')) {
    return overrides.invalidState;
  }
  if (raw.includes('NotAuthorized')) {
    return overrides.unauthorized;
  }
  if (raw.includes('insufficient funds') || raw.includes('exceeds balance')) {
    return 'Insufficient funds for gas fees.';
  }
  if (raw.includes('chain') || raw.includes('network')) {
    return 'Please switch to Base network and try again.';
  }

  return 'Something went wrong. Please try again.';
}
