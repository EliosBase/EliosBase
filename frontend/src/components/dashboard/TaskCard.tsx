'use client';

import { useState, useEffect } from 'react';
import ProofBadge from './ProofBadge';
import { type Task } from '@/lib/types';
import { TASK_STEPS } from '@/lib/constants';
import { Bot, CheckCircle, Loader2 } from 'lucide-react';
import { useEscrowRelease } from '@/hooks/useEscrow';
import { useQueryClient } from '@tanstack/react-query';

interface TaskCardProps {
  task: Task;
  isSubmitter?: boolean;
}

type ReleaseStep = 'idle' | 'signing' | 'mining' | 'confirming' | 'released' | 'error';

export default function TaskCard({ task, isSubmitter }: TaskCardProps) {
  const currentStepIndex = TASK_STEPS.indexOf(task.currentStep);
  const queryClient = useQueryClient();
  const { release, txHash, isSigning, isMining, isConfirmed, error: contractError, reset } = useEscrowRelease();
  const [releaseStep, setReleaseStep] = useState<ReleaseStep>('idle');
  const [releaseError, setReleaseError] = useState('');

  const canRelease = isSubmitter && task.currentStep === 'Complete' && task.agentOperatorAddress;

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
      const msg = contractError.message?.includes('User rejected')
        ? 'Transaction rejected'
        : contractError.message?.slice(0, 100) || 'Release failed';
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
        const data = await res.json().catch(() => ({ error: 'Failed to register release' }));
        setReleaseError(data.error || 'Failed to register release');
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
      setReleaseError('Network error');
      setReleaseStep('error');
    }
  }

  const proofStatus = task.status === 'completed'
    ? 'verified' as const
    : task.currentStep === 'ZK Verifying'
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

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/6">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-white/40" />
          <span className="text-xs text-white/50 font-[family-name:var(--font-body)]">
            {task.assignedAgent}
          </span>
        </div>
        <div className="flex items-center gap-3">
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
    </div>
  );
}
