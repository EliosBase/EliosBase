'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTasks } from './useTasks';
import { useAuthContext } from '@/providers/AuthProvider';

const inFlightAdvances = new Set<string>();

async function advanceTask(taskId: string) {
  if (inFlightAdvances.has(taskId)) {
    return null;
  }

  inFlightAdvances.add(taskId);

  try {
    const res = await fetch(`/api/tasks/${taskId}/advance`, { method: 'POST' });
    return await res.json();
  } finally {
    inFlightAdvances.delete(taskId);
  }
}

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
        const data = await advanceTask(taskId);
        if (!data) return;

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
  const { session } = useAuthContext();

  useEffect(() => {
    if (!enabled || !session?.userId) return;

    const canManageAll = session.role === 'admin';
    const activeTasks = tasks.filter(
      (t) =>
        t.status === 'active'
        && t.currentStep !== 'Complete'
        && (canManageAll || t.submitterId === session.userId),
    );
    if (activeTasks.length === 0) return;

    const interval = setInterval(async () => {
      let anyAdvanced = false;
      for (const task of activeTasks) {
        try {
          const data = await advanceTask(task.id);
          if (!data) continue;
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
  }, [enabled, intervalMs, queryClient, session, tasks]);
}
