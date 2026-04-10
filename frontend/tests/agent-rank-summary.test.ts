import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardResponse } from '@/lib/types/leaderboard';

/**
 * Tests for `getAgentRankSummary`, the per-agent rank helper that powers
 * the leaderboard badge on the agent passport and the OG image headline.
 *
 * `getAgentRankSummary` composes three `getLeaderboard()` calls (7d / 30d
 * / all) and picks the target agent's entry out of each payload. We can't
 * mock `@/lib/leaderboard` from within itself, so instead we mock the
 * cache layer and have `withJsonCache` return pre-baked payloads keyed by
 * window. That short-circuits both Supabase and Upstash entirely while
 * still exercising the real `getAgentRankSummary` pick/merge logic.
 */

const mocks = vi.hoisted(() => ({
  payloads: new Map<string, LeaderboardResponse>(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createPublicServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/cache', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache')>('@/lib/cache');
  return {
    ...actual,
    readJsonCache: vi.fn(),
    writeJsonCache: vi.fn(),
    // Intercept withJsonCache and return the pre-baked payload for the
    // requested window. If a payload wasn't registered for the window,
    // we fall back to calling compute() so the test fails loudly rather
    // than silently returning stale state.
    withJsonCache: async <T,>(
      _ns: string,
      id: string,
      _ttl: number,
      compute: () => Promise<T>,
    ) => {
      const preset = mocks.payloads.get(id);
      if (preset) return preset as T;
      return compute();
    },
  };
});

const { getAgentRankSummary } = await import('@/lib/leaderboard');

function buildPayload(
  window: '7d' | '30d' | 'all',
  entries: Array<{ agentId: string; rank: number; ethEarned: number; name?: string }>,
): LeaderboardResponse {
  return {
    window,
    generatedAt: '2026-04-10T00:00:00.000Z',
    totalAgents: entries.length,
    totalEarnedEth: entries.reduce((sum, entry) => sum + entry.ethEarned, 0),
    entries: entries.map((entry) => ({
      rank: entry.rank,
      agentId: entry.agentId,
      name: entry.name ?? `Agent ${entry.agentId}`,
      type: 'analyst',
      status: 'online',
      reputation: 90,
      tasksCompleted: 10,
      walletAddress: null,
      ethEarned: entry.ethEarned,
      tasksPaid: 1,
      avgReward: entry.ethEarned,
      pricePerTask: '0',
    })),
  };
}

describe('getAgentRankSummary', () => {
  beforeEach(() => {
    mocks.payloads.clear();
  });

  it('returns rank, total, and ethEarned for an agent ranked in every window', async () => {
    mocks.payloads.set(
      '7d',
      buildPayload('7d', [
        { agentId: 'a1', rank: 1, ethEarned: 2.5 },
        { agentId: 'a2', rank: 2, ethEarned: 1.2 },
      ]),
    );
    mocks.payloads.set(
      '30d',
      buildPayload('30d', [
        { agentId: 'a1', rank: 3, ethEarned: 5.4 },
        { agentId: 'a2', rank: 1, ethEarned: 10.1 },
        { agentId: 'a3', rank: 2, ethEarned: 7.8 },
      ]),
    );
    mocks.payloads.set(
      'all',
      buildPayload('all', [
        { agentId: 'a1', rank: 4, ethEarned: 9.9 },
        { agentId: 'a2', rank: 1, ethEarned: 50.0 },
        { agentId: 'a3', rank: 2, ethEarned: 40.0 },
        { agentId: 'a4', rank: 3, ethEarned: 12.0 },
      ]),
    );

    const summary = await getAgentRankSummary('a1');

    expect(summary['7d']).toEqual({ rank: 1, total: 2, ethEarned: 2.5 });
    expect(summary['30d']).toEqual({ rank: 3, total: 3, ethEarned: 5.4 });
    expect(summary.all).toEqual({ rank: 4, total: 4, ethEarned: 9.9 });
  });

  it('returns null for windows where the agent is not present', async () => {
    mocks.payloads.set(
      '7d',
      buildPayload('7d', [
        { agentId: 'other-1', rank: 1, ethEarned: 1.0 },
        { agentId: 'other-2', rank: 2, ethEarned: 0.5 },
      ]),
    );
    mocks.payloads.set(
      '30d',
      buildPayload('30d', [
        { agentId: 'target', rank: 5, ethEarned: 3.3 },
        { agentId: 'other-1', rank: 1, ethEarned: 10.0 },
      ]),
    );
    mocks.payloads.set(
      'all',
      buildPayload('all', [{ agentId: 'other-1', rank: 1, ethEarned: 99.9 }]),
    );

    const summary = await getAgentRankSummary('target');

    expect(summary['7d']).toBeNull();
    expect(summary['30d']).toEqual({ rank: 5, total: 2, ethEarned: 3.3 });
    expect(summary.all).toBeNull();
  });

  it('returns all nulls when the agent has never earned in any window', async () => {
    const empty = buildPayload('30d', [
      { agentId: 'someone-else', rank: 1, ethEarned: 1.0 },
    ]);
    mocks.payloads.set('7d', empty);
    mocks.payloads.set('30d', empty);
    mocks.payloads.set('all', empty);

    const summary = await getAgentRankSummary('ghost');

    expect(summary['7d']).toBeNull();
    expect(summary['30d']).toBeNull();
    expect(summary.all).toBeNull();
  });

  it('preserves zero earnings as a ranked-but-earnless entry, not null', async () => {
    const payload = buildPayload('30d', [
      { agentId: 'winner', rank: 1, ethEarned: 5 },
      { agentId: 'newcomer', rank: 2, ethEarned: 0 },
    ]);
    mocks.payloads.set('7d', payload);
    mocks.payloads.set('30d', payload);
    mocks.payloads.set('all', payload);

    const summary = await getAgentRankSummary('newcomer');

    expect(summary['7d']).toEqual({ rank: 2, total: 2, ethEarned: 0 });
    expect(summary['30d']).toEqual({ rank: 2, total: 2, ethEarned: 0 });
    expect(summary.all).toEqual({ rank: 2, total: 2, ethEarned: 0 });
  });
});
