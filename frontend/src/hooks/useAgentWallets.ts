'use client';

import { useQuery } from '@tanstack/react-query';
import type { Agent, AgentWalletTransfer } from '@/lib/types';

interface AgentWalletsResponse {
  agents: Agent[];
  transfers: AgentWalletTransfer[];
  reviewQueue: AgentWalletTransfer[];
}

async function fetchAgentWallets() {
  const res = await fetch('/api/agent-wallets');
  if (!res.ok) {
    throw new Error('Failed to fetch agent wallets');
  }

  return res.json() as Promise<AgentWalletsResponse>;
}

export function useAgentWallets(enabled = true) {
  return useQuery({
    queryKey: ['agent-wallets'],
    queryFn: fetchAgentWallets,
    enabled,
  });
}
