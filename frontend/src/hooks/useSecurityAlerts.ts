'use client';

import { useQuery } from '@tanstack/react-query';
import type { SecurityAlert } from '@/lib/types';

async function fetchAlerts(): Promise<SecurityAlert[]> {
  const res = await fetch('/api/security/alerts');
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

export function useSecurityAlerts(enabled = true) {
  return useQuery({
    queryKey: ['security-alerts'],
    queryFn: fetchAlerts,
    enabled,
  });
}
