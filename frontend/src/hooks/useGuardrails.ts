'use client';

import { useQuery } from '@tanstack/react-query';
import type { Guardrail } from '@/lib/types';

async function fetchGuardrails(): Promise<Guardrail[]> {
  const res = await fetch('/api/security/guardrails');
  if (!res.ok) throw new Error('Failed to fetch guardrails');
  return res.json();
}

export function useGuardrails(enabled = true) {
  return useQuery({
    queryKey: ['guardrails'],
    queryFn: fetchGuardrails,
    enabled,
  });
}
