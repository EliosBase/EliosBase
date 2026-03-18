'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@/lib/types';

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks');
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: { title: string; description: string; reward: string }) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create task');
      }
      return res.json() as Promise<Task>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
