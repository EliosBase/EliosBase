'use client';

import { X } from 'lucide-react';
import { useTaskResult } from '@/hooks/useTaskResult';

const severityStyles = {
  critical: 'bg-red-500/15 text-red-300 border border-red-500/25',
  high: 'bg-orange-500/15 text-orange-300 border border-orange-500/25',
  medium: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25',
  low: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  info: 'bg-white/10 text-white/70 border border-white/15',
};

interface TaskResultModalProps {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}

export default function TaskResultModal({ taskId, taskTitle, onClose }: TaskResultModalProps) {
  const { data, isLoading, isError, error } = useTaskResult(taskId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="glass w-full max-w-3xl rounded-3xl border border-white/10 p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Task Result</p>
            <h2 className="mt-2 text-xl font-semibold text-white font-[family-name:var(--font-heading)]">
              {taskTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-white/60 transition-colors hover:border-white/20 hover:text-white"
            aria-label="Close task result"
          >
            <X size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error instanceof Error ? error.message : 'Failed to load task result'}
          </div>
        )}

        {data && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Summary</p>
              <p className="mt-3 text-sm leading-6 text-white/80">{data.summary}</p>
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Findings</p>
              {data.findings.length === 0 ? (
                <p className="mt-3 text-sm text-white/45">No findings were returned.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.findings.map((finding, index) => (
                    <div key={`${finding.title}-${index}`} className="rounded-xl border border-white/8 bg-black/10 p-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${severityStyles[finding.severity]}`}>
                          {finding.severity}
                        </span>
                        <p className="text-sm font-medium text-white">{finding.title}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/65">{finding.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Recommendations</p>
              {data.recommendations.length === 0 ? (
                <p className="mt-3 text-sm text-white/45">No recommendations were returned.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-white/75">
                  {data.recommendations.map((recommendation, index) => (
                    <li key={`${recommendation}-${index}`} className="rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                      {recommendation}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Metadata</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Model</p>
                  <p className="mt-2 text-sm text-white/75">{data.metadata.model}</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Tokens Used</p>
                  <p className="mt-2 text-sm text-white/75">{data.metadata.tokensUsed.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Execution Time</p>
                  <p className="mt-2 text-sm text-white/75">{data.metadata.executionTimeMs.toLocaleString()} ms</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Agent Type</p>
                  <p className="mt-2 text-sm capitalize text-white/75">{data.metadata.agentType}</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
