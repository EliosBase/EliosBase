'use client';

import { useState, useEffect, useRef } from 'react';
import { type Agent } from '@/lib/types';
import { Bot, Star, CheckCircle, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEscrowLock } from '@/hooks/useEscrow';
import { useAuthContext } from '@/providers/AuthProvider';
import TaskPickerModal from './TaskPickerModal';

interface AgentCardProps {
  agent: Agent;
}

const statusColors = {
  online: 'bg-green-500',
  busy: 'bg-yellow-500',
  offline: 'bg-white/30',
};

type HireStep = 'idle' | 'signing' | 'mining' | 'confirming' | 'hired' | 'error';

export default function AgentCard({ agent }: AgentCardProps) {
  const [step, setStep] = useState<HireStep>('idle');
  const [error, setError] = useState('');
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const selectedTaskId = useRef<string>('');
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthContext();
  const { lock, txHash, isSigning, isMining, isConfirmed, error: contractError, reset } = useEscrowLock();

  // Track contract interaction state
  useEffect(() => {
    if (isSigning && step === 'idle') setStep('signing');
    if (isMining && step === 'signing') setStep('mining');
  }, [isSigning, isMining, step]);

  // When tx is confirmed on-chain, call the hire API with the real tx hash
  useEffect(() => {
    if (isConfirmed && txHash && step === 'mining') {
      setStep('confirming');
      registerHire(txHash);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  // Handle contract errors
  useEffect(() => {
    if (contractError && step !== 'idle' && step !== 'hired') {
      setStep('error');
      const msg = contractError.message?.includes('User rejected')
        ? 'Transaction rejected'
        : contractError.message?.slice(0, 100) || 'Transaction failed';
      setError(msg);
    }
  }, [contractError, step]);

  async function handleHire() {
    if (step !== 'idle' && step !== 'error') return;
    if (!isAuthenticated) {
      setError('Connect wallet and sign in first');
      setStep('error');
      return;
    }
    setError('');
    reset();
    setShowTaskPicker(true);
  }

  function handleTaskSelected(taskId: string) {
    selectedTaskId.current = taskId;
    setShowTaskPicker(false);
    setStep('idle');
    // Phase 1: On-chain — lock funds via smart contract
    lock(taskId, agent.id, agent.pricePerTask);
  }

  async function registerHire(hash: string) {
    // Phase 2: Off-chain — tell the API about the real tx
    try {
      const res = await fetch(`/api/agents/${agent.id}/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash, taskId: selectedTaskId.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to register hire' }));
        setError(data.error || 'Failed to register hire');
        setStep('error');
        return;
      }
      setStep('hired');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['audit-log'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['security-stats'] });
    } catch {
      setError('Network error');
      setStep('error');
    }
  }

  function retryHire() {
    setStep('idle');
    setError('');
    reset();
  }

  const buttonLabel = {
    idle: 'Hire',
    signing: 'Sign Tx...',
    mining: 'Mining...',
    confirming: 'Confirming...',
    hired: 'Hired',
    error: 'Retry',
  }[step];

  const isDisabled = ['signing', 'mining', 'confirming'].includes(step) || agent.status === 'offline';

  return (
    <div className="glass p-5 rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
            <Bot size={20} className="text-white/60" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
              {agent.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]}`} />
              <span className="text-[11px] text-white/40 capitalize">{agent.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-white/60">
          <Star size={12} className="fill-current" />
          <span className="text-xs font-medium">{agent.reputation}</span>
        </div>
      </div>

      <p className="text-xs text-white/50 mb-3 leading-relaxed font-[family-name:var(--font-body)] line-clamp-2">
        {agent.description}
      </p>

      <div className="mb-3">
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-white/30 transition-all"
            style={{ width: `${agent.reputation}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {agent.capabilities.map((cap) => (
          <span
            key={cap}
            className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-white/50 border border-white/6"
          >
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/6">
        <div>
          <p className="text-xs text-white/40">Price</p>
          <p className="text-sm font-medium text-white font-[family-name:var(--font-mono)]">
            {agent.pricePerTask}
          </p>
        </div>
        <button
          onClick={step === 'error' ? retryHire : handleHire}
          disabled={isDisabled || step === 'hired'}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            step === 'hired'
              ? 'bg-green-500/15 text-green-400 border border-green-500/20'
              : agent.status === 'offline'
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : step === 'error'
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20'
                  : 'bg-white text-black hover:bg-white/90'
          } disabled:opacity-70`}
        >
          {step === 'hired' ? (
            <span className="flex items-center gap-1"><CheckCircle size={12} /> Hired</span>
          ) : ['signing', 'mining', 'confirming'].includes(step) ? (
            <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {buttonLabel}</span>
          ) : (
            buttonLabel
          )}
        </button>
      </div>

      {showTaskPicker && (
        <TaskPickerModal
          onSelect={handleTaskSelected}
          onClose={() => setShowTaskPicker(false)}
        />
      )}

      {error && (
        <p className="text-[10px] text-red-400 mt-2">{error}</p>
      )}

      <p className="text-[10px] text-white/30 mt-2">
        {agent.tasksCompleted.toLocaleString()} tasks completed
      </p>
    </div>
  );
}
