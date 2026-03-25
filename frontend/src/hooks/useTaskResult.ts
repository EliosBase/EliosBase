'use client';

import { useQuery } from '@tanstack/react-query';
import type { AgentExecutionResult } from '@/lib/types';

async function fetchTaskResult(taskId: string): Promise<AgentExecutionResult> {
  const res = await fetch(`/api/tasks/${taskId}/result`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to fetch task result' }));
    throw new Error(data.error || 'Failed to fetch task result');
  }

  return res.json();
}

export function useTaskResult(taskId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['task-result', taskId],
    queryFn: () => fetchTaskResult(taskId!),
    enabled: enabled && !!taskId,
  });
}
