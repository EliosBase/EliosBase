'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActivityEvent } from '@/lib/types';

async function fetchActivity(): Promise<ActivityEvent[]> {
  const res = await fetch('/api/activity');
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: fetchActivity,
  });
}
