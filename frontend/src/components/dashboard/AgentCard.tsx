'use client';

import { useState } from 'react';
import { type Agent } from '@/lib/types';
import { Bot, Star, CheckCircle, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface AgentCardProps {
  agent: Agent;
}

const statusColors = {
  online: 'bg-green-500',
  busy: 'bg-yellow-500',
  offline: 'bg-white/30',
};

export default function AgentCard({ agent }: AgentCardProps) {
  const [hired, setHired] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  async function handleHire() {
    if (hired || hiring) return;
    setHiring(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agent.id}/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to hire agent');
        return;
      }
      setHired(true);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['audit-log'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
    } catch {
      setError('Network error');
    } finally {
      setHiring(false);
    }
  }

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

      {/* Reputation bar */}
      <div className="mb-3">
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-white/30 transition-all"
            style={{ width: `${agent.reputation}%` }}
          />
        </div>
      </div>

      {/* Capabilities */}
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

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/6">
        <div>
          <p className="text-xs text-white/40">Price</p>
          <p className="text-sm font-medium text-white font-[family-name:var(--font-mono)]">
            {agent.pricePerTask}
          </p>
        </div>
        <button
          onClick={handleHire}
          disabled={hired || hiring || agent.status === 'offline'}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            hired
              ? 'bg-green-500/15 text-green-400 border border-green-500/20'
              : agent.status === 'offline'
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : 'bg-white text-black hover:bg-white/90'
          } disabled:opacity-70`}
        >
          {hired ? (
            <span className="flex items-center gap-1">
              <CheckCircle size={12} /> Hired
            </span>
          ) : hiring ? (
            <span className="flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Hiring...
            </span>
          ) : (
            'Hire'
          )}
        </button>
      </div>

      {error && (
        <p className="text-[10px] text-red-400 mt-2">{error}</p>
      )}

      <p className="text-[10px] text-white/30 mt-2">
        {agent.tasksCompleted.toLocaleString()} tasks completed
      </p>
    </div>
  );
}
