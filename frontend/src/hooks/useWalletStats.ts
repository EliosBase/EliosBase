'use client';

import { useQuery } from '@tanstack/react-query';

export interface WalletStats {
  balance: string;
  balanceTrend: string;
  inEscrow: string;
  inEscrowTrend: string;
  totalEarned: string;
  totalEarnedTrend: string;
  staked: string;
  stakedTrend: string;
}

async function fetchWalletStats(): Promise<WalletStats> {
  const res = await fetch('/api/wallet/stats');
  if (!res.ok) throw new Error('Failed to fetch wallet stats');
  return res.json();
}

export function useWalletStats(enabled = true) {
  return useQuery({
    queryKey: ['wallet-stats'],
    queryFn: fetchWalletStats,
    enabled,
  });
}
