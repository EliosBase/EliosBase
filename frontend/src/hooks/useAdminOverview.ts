import { useQuery } from '@tanstack/react-query';

export interface AdminOverview {
  tasks: {
    active: number;
    completed: number;
    failed: number;
    executing: number;
  };
  agents: {
    online: number;
    busy: number;
  };
  openAlerts: number;
  recentAudit: {
    timestamp: string;
    action: string;
    actor: string;
    target: string;
    result: 'ALLOW' | 'DENY' | 'FLAG';
  }[];
}

export function useAdminOverview(enabled: boolean) {
  return useQuery<AdminOverview>({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error('Failed to fetch admin overview');
      return res.json();
    },
    enabled,
    refetchInterval: 15_000,
  });
}
