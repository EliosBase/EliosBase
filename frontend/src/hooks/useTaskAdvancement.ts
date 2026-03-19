'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/cron/advance-tasks');
        const data = await res.json();
        if (data.advanced > 0) {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['activity'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        }
      } catch {
        // Silently retry
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs, queryClient]);
}
