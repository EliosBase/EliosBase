'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTasks } from './useTasks';

/**
 * Polls the task advance endpoint every `intervalMs` for a specific task.
 * Invalidates task + activity caches when a step advances.
 */
export function useTaskAdvancement(taskId: string | null, enabled = true, intervalMs = 10000) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!taskId || !enabled) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/advance`, { method: 'POST' });
        const data = await res.json();
        if (data.advanced) {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['activity'] });
          queryClient.invalidateQueries({ queryKey: ['audit-log'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          if (data.currentStep === 'Complete') {
            queryClient.invalidateQueries({ queryKey: ['agents'] });
            queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [taskId, enabled, intervalMs, queryClient]);
}

/**
 * Polls the batch advance endpoint to advance ALL active tasks.
 * Use on dashboard page to keep all tasks progressing.
 */
export function useBatchTaskAdvancement(enabled = true, intervalMs = 15000) {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useTasks();

  useEffect(() => {
    if (!enabled) return;

    const activeTasks = tasks.filter((t) => t.status === 'active' && t.currentStep !== 'Complete');
    if (activeTasks.length === 0) return;

    const interval = setInterval(async () => {
      let anyAdvanced = false;
      for (const task of activeTasks) {
        try {
          const res = await fetch(`/api/tasks/${task.id}/advance`, { method: 'POST' });
          const data = await res.json();
          if (data.advanced) anyAdvanced = true;
        } catch {
          // Skip failed tasks
        }
      }
      if (anyAdvanced) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['activity'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs, queryClient, tasks]);
}
