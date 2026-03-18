'use client';

import { useQuery } from '@tanstack/react-query';
import type { Agent } from '@/lib/types';

interface UseAgentsOptions {
  type?: string;
  status?: string;
  search?: string;
}

async function fetchAgents(opts: UseAgentsOptions = {}): Promise<Agent[]> {
  const params = new URLSearchParams();
  if (opts.type) params.set('type', opts.type);
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);

  const url = `/api/agents${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export function useAgents(opts: UseAgentsOptions = {}) {
  return useQuery({
    queryKey: ['agents', opts],
    queryFn: () => fetchAgents(opts),
  });
}
