'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Agent } from '@/lib/types';

interface RegisterAgentInput {
  name: string;
  description: string;
  type: string;
  capabilities: string[];
  pricePerTask: string;
}

export function useRegisterAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agent: RegisterAgentInput) => {
      const res = await fetch('/api/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to register agent');
      }
      return res.json() as Promise<Agent>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
