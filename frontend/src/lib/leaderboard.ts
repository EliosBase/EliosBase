import { createPublicServerClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAgentEarnings } from '@/lib/agentEarnings';
import { withJsonCache } from '@/lib/cache';
import type { DbAgent } from '@/lib/types/database';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardWindow,
} from '@/lib/types/leaderboard';

/**
 * Server-side leaderboard computation and caching.
 *
 * Extracted from the route handler so server components (the /leaderboard
 * page, the homepage TopAgentsStrip) can call it directly without going
 * through a self-fetch round trip. Everything public-facing should go
 * through `getLeaderboard()` so the Upstash cache is consistently hit.
 */

const CACHE_TTL_SECONDS = 60;

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Compute the full leaderboard for the given window. Hits the database
 * directly — do not call this from a hot path; prefer `getLeaderboard()`
 * which wraps this in the Upstash cache layer.
 */
export async function computeLeaderboard(
  window: LeaderboardWindow,
): Promise<LeaderboardResponse> {
  const publicSupabase = createPublicServerClient();
  const serviceSupabase = createServiceClient();

  const [agentsRes, earningsMap] = await Promise.all([
    publicSupabase
      .from('agents')
      .select('id, name, type, status, reputation, tasks_completed, wallet_address, price_per_task')
      .neq('status', 'suspended'),
    fetchAgentEarnings(serviceSupabase, { window }),
  ]);

  if (agentsRes.error) {
    throw new Error(`Failed to fetch agents: ${agentsRes.error.message}`);
  }

  const agents = agentsRes.data ?? [];

  // Build entries: every non-suspended agent appears, even with zero earnings
  // in the window, so that new agents are visible and the list doesn't look
  // empty right after a window boundary.
  const entries: Array<Omit<LeaderboardEntry, 'rank'>> = agents.map((agent) => {
    const earnings = earningsMap.get(agent.id);
    return {
      agentId: agent.id,
      name: agent.name,
      type: agent.type as DbAgent['type'],
      status: agent.status as DbAgent['status'],
      reputation: agent.reputation ?? 0,
      tasksCompleted: agent.tasks_completed ?? 0,
      walletAddress: agent.wallet_address ?? null,
      ethEarned: round(earnings?.ethEarned ?? 0),
      tasksPaid: earnings?.tasksPaid ?? 0,
      avgReward: round(earnings?.avgReward ?? 0),
      pricePerTask: agent.price_per_task ?? '0',
    };
  });

  // Primary sort: earnings in window, desc.
  // Tiebreakers (in order): reputation desc, tasks_completed desc, name asc.
  // The tiebreakers prevent bursts of zero-earning agents from shuffling on
  // every request and give newer agents a deterministic display order.
  entries.sort((a, b) => {
    if (b.ethEarned !== a.ethEarned) return b.ethEarned - a.ethEarned;
    if (b.reputation !== a.reputation) return b.reputation - a.reputation;
    if (b.tasksCompleted !== a.tasksCompleted) return b.tasksCompleted - a.tasksCompleted;
    return a.name.localeCompare(b.name);
  });

  const ranked: LeaderboardEntry[] = entries.map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }));

  const totalEarnedEth = round(entries.reduce((sum, entry) => sum + entry.ethEarned, 0));

  return {
    window,
    generatedAt: new Date().toISOString(),
    totalAgents: entries.length,
    totalEarnedEth,
    entries: ranked,
  };
}

/**
 * Cache-aware leaderboard fetcher. Reads from Upstash; on miss, computes and
 * stores. TTL is 60s — combined with the 30s HTTP `s-maxage` at the API
 * surface, worst-case staleness is ~90s, which is acceptable for a marketing
 * display that updates once per confirmed payout anyway.
 */
export async function getLeaderboard(
  window: LeaderboardWindow,
): Promise<LeaderboardResponse> {
  return withJsonCache<LeaderboardResponse>(
    'leaderboard',
    window,
    CACHE_TTL_SECONDS,
    () => computeLeaderboard(window),
  );
}

/**
 * Per-agent rank summary across every window. Re-uses the cached leaderboard
 * payloads so calling this from a server component never hits the DB more
 * than once per window per minute, regardless of how many passport pages
 * are being rendered simultaneously.
 *
 * Returns `null` for a window when the agent is not ranked there (e.g. a
 * suspended agent or one whose row was filtered out). Also returns the
 * total agents ranked in each window so the badge can render "#3 of 42".
 */
export async function getAgentRankSummary(agentId: string): Promise<{
  '7d': { rank: number; total: number; ethEarned: number } | null;
  '30d': { rank: number; total: number; ethEarned: number } | null;
  all: { rank: number; total: number; ethEarned: number } | null;
}> {
  const [sevenDay, thirtyDay, allTime] = await Promise.all([
    getLeaderboard('7d'),
    getLeaderboard('30d'),
    getLeaderboard('all'),
  ]);

  const pick = (payload: LeaderboardResponse) => {
    const entry = payload.entries.find((row) => row.agentId === agentId);
    if (!entry) return null;
    return {
      rank: entry.rank,
      total: payload.totalAgents,
      ethEarned: entry.ethEarned,
    };
  };

  return {
    '7d': pick(sevenDay),
    '30d': pick(thirtyDay),
    all: pick(allTime),
  };
}
