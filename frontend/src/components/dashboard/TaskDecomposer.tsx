'use client';

import { useTaskDecomposer, type DecomposedSubtask } from '@/hooks/useTaskDecomposer';

interface Props {
  title: string;
  description: string;
}

const AGENT_COLORS: Record<DecomposedSubtask['recommendedAgent'], string> = {
  sentinel: 'bg-red-500/10 text-red-300 border-red-500/30',
  analyst: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  executor: 'bg-green-500/10 text-green-300 border-green-500/30',
  auditor: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  optimizer: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
};

const COMPLEXITY_COLORS: Record<string, string> = {
  low: 'text-green-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
};

export default function TaskDecomposer({ title, description }: Props) {
  const { phase, rawStream, plan, error, decompose, reset, isStreaming } =
    useTaskDecomposer();

  const canRun = title.trim().length > 0 && description.trim().length >= 10;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 animate-pulse" />
            AI Task Decomposer
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Claude analyzes your task and breaks it into steps with recommended agents
          </p>
        </div>
        {phase !== 'idle' && (
          <button
            onClick={reset}
            className="text-xs text-white/40 hover:text-white/70 transition-colors cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {phase === 'idle' && (
        <button
          onClick={() => decompose({ title, description })}
          disabled={!canRun}
          className="w-full py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {canRun ? 'Decompose Task with Claude' : 'Enter title + 10+ char description'}
        </button>
      )}

      {isStreaming && (
        <div>
          <div className="flex items-center gap-2 text-xs text-white/60 mb-3">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            {phase === 'planning' ? 'Connecting to Claude...' : 'Claude is planning...'}
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-[11px] text-white/70 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {rawStream || <span className="text-white/30">Waiting for tokens...</span>}
            <span className="inline-block w-1.5 h-3 bg-white/60 ml-0.5 animate-pulse" />
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      {phase === 'complete' && plan && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-white/50">
              Complexity:{' '}
              <span className={`font-semibold ${COMPLEXITY_COLORS[plan.complexity] ?? ''}`}>
                {plan.complexity.toUpperCase()}
              </span>
            </span>
            <span className="text-white/50">
              Est:{' '}
              <span className="text-white/80 font-semibold">{plan.estimatedDuration}</span>
            </span>
            <span className="text-white/50">
              Steps:{' '}
              <span className="text-white/80 font-semibold">{plan.subtasks.length}</span>
            </span>
          </div>

          <div className="space-y-2">
            {plan.subtasks.map((sub) => (
              <div
                key={sub.order}
                className="rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/40">
                      #{sub.order}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {sub.title}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${AGENT_COLORS[sub.recommendedAgent]}`}
                  >
                    {sub.recommendedAgent}
                  </span>
                </div>
                <p className="text-xs text-white/60 mb-1">{sub.description}</p>
                <p className="text-[11px] text-white/40 italic">→ {sub.rationale}</p>
              </div>
            ))}
          </div>

          {plan.risks && plan.risks.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-1.5">
                Execution Risks
              </div>
              <ul className="space-y-1">
                {plan.risks.map((risk, i) => (
                  <li key={i} className="text-xs text-amber-200/70">
                    • {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
