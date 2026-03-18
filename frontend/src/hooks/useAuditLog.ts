'use client';

import { useQuery } from '@tanstack/react-query';
import type { AuditLogEntry } from '@/lib/types';

async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const res = await fetch('/api/security/audit-log');
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return res.json();
}

export function useAuditLog(enabled = true) {
  return useQuery({
    queryKey: ['audit-log'],
    queryFn: fetchAuditLog,
    enabled,
  });
}
