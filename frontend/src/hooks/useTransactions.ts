'use client';

import { useQuery } from '@tanstack/react-query';
import type { Transaction } from '@/lib/types';

async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch('/api/transactions');
  if (!res.ok) throw new Error('Failed to fetch transactions');
  return res.json();
}

export function useTransactions(enabled = true) {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    enabled,
  });
}
