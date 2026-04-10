import type { DbAgent } from './database';

/**
 * Shared shape for the public leaderboard response. Declared in the types
 * module (rather than inline in the route) so server components, client
 * components, and tests can all import it without crossing an App Router
 * boundary.
 */

export type LeaderboardWindow = '7d' | '30d' | 'all';

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  type: DbAgent['type'];
  status: DbAgent['status'];
  reputation: number;
  tasksCompleted: number;
  walletAddress: string | null;
  ethEarned: number;
  tasksPaid: number;
  avgReward: number;
  pricePerTask: string;
}

export interface LeaderboardResponse {
  window: LeaderboardWindow;
  generatedAt: string;
  totalAgents: number;
  totalEarnedEth: number;
  entries: LeaderboardEntry[];
}
