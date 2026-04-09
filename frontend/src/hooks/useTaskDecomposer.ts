'use client';

import { useCallback, useRef, useState } from 'react';

export interface DecomposedSubtask {
  order: number;
  title: string;
  description: string;
  recommendedAgent: 'sentinel' | 'analyst' | 'executor' | 'auditor' | 'optimizer';
  rationale: string;
}

export interface TaskDecompositionPlan {
  complexity: 'low' | 'medium' | 'high';
  estimatedDuration: string;
  subtasks: DecomposedSubtask[];
  risks?: string[];
}

interface DecomposerState {
  phase: 'idle' | 'planning' | 'streaming' | 'complete' | 'error';
  rawStream: string;
  plan: TaskDecompositionPlan | null;
  error: string | null;
}

const INITIAL_STATE: DecomposerState = {
  phase: 'idle',
  rawStream: '',
  plan: null,
  error: null,
};

/**
 * Streams a task decomposition from POST /api/tasks/decompose using fetch + ReadableStream.
 * Parses Server-Sent Events line-by-line to produce a live-updating rawStream + final plan.
 */
export function useTaskDecomposer() {
  const [state, setState] = useState<DecomposerState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const decompose = useCallback(
    async (input: { title: string; description: string }) => {
      // Cancel any in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...INITIAL_STATE, phase: 'planning' });

      try {
        const res = await fetch('/api/tasks/decompose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({ error: 'Decompose failed' }));
          setState({
            ...INITIAL_STATE,
            phase: 'error',
            error: errBody.error ?? 'Decompose failed',
          });
          return;
        }

        setState((s) => ({ ...s, phase: 'streaming' }));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE event delimiter is a blank line
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const block of events) {
            const lines = block.split('\n');
            let eventName = 'message';
            let dataLine = '';
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
            }
            if (!dataLine) continue;

            let payload: unknown;
            try {
              payload = JSON.parse(dataLine);
            } catch {
              continue;
            }

            if (eventName === 'token') {
              const delta = (payload as { delta?: string }).delta ?? '';
              setState((s) => ({ ...s, rawStream: s.rawStream + delta }));
            } else if (eventName === 'complete') {
              const plan = (payload as { plan?: TaskDecompositionPlan }).plan ?? null;
              setState((s) => ({ ...s, phase: 'complete', plan }));
            } else if (eventName === 'error') {
              const message =
                (payload as { message?: string }).message ?? 'Decomposer error';
              setState((s) => ({ ...s, phase: 'error', error: message }));
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState({
          ...INITIAL_STATE,
          phase: 'error',
          error: err instanceof Error ? err.message : 'Decomposer failed',
        });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    decompose,
    reset,
    isStreaming: state.phase === 'planning' || state.phase === 'streaming',
  };
}
