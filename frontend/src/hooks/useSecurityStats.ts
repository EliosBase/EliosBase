'use client';

import { useQuery } from '@tanstack/react-query';

export interface SecurityStats {
  threatsBlocked: number;
  threatsBlockedTrend: string;
  guardrailsActive: number;
  guardrailsTotal: number;
  guardrailsTrend: string;
  proofsVerified: number;
  proofsTrend: string;
  auditEntries: number;
  auditEntriesTrend: string;
}

async function fetchSecurityStats(): Promise<SecurityStats> {
  const res = await fetch('/api/security/stats');
  if (!res.ok) throw new Error('Failed to fetch security stats');
  return res.json();
}

export function useSecurityStats(enabled = true) {
  return useQuery({
    queryKey: ['security-stats'],
    queryFn: fetchSecurityStats,
    enabled,
  });
}
