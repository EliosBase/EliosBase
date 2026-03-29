'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/providers/AuthProvider';

type SyncResponse = {
  synced?: {
    confirmed?: number;
    failed?: number;
  };
};

export function useTransactionSync(intervalMs = 15000) {
  const { isAuthenticated, isSessionLoading } = useAuthContext();
  const queryClient = useQueryClient();
  const isSyncing = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || isSessionLoading) {
      return;
    }

    async function syncPendingTransactions() {
      if (isSyncing.current) {
        return;
      }

      isSyncing.current = true;

      try {
        const res = await fetch('/api/transactions/sync', { cache: 'no-store' });
        if (!res.ok) {
          return;
        }

        const data = await res.json() as SyncResponse;
        const confirmed = data.synced?.confirmed ?? 0;
        const failed = data.synced?.failed ?? 0;

        if (confirmed === 0 && failed === 0) {
          return;
        }

        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-stats'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['activity'] });
      } catch {
        // Leave stale pending rows in place until the next sync attempt.
      } finally {
        isSyncing.current = false;
      }
    }

    void syncPendingTransactions();

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void syncPendingTransactions();
      }
    }, intervalMs);

    const handleFocus = () => {
      void syncPendingTransactions();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [intervalMs, isAuthenticated, isSessionLoading, queryClient]);
}
