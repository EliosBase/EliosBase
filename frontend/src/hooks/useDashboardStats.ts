'use client';

import { useQuery } from '@tanstack/react-query';

export interface DashboardStats {
  activeAgents: number;
  activeAgentsTrend: string;
  activeTasks: number;
  activeTasksTrend: string;
  tvl: number;
  tvlTrend: string;
  zkProofs: number;
  zkProofsTrend: string;
  sparklines?: {
    agents: number[];
    tasks: number[];
    tvl: number[];
    proofs: number[];
  };
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });
}
