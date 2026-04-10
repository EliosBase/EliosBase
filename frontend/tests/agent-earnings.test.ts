import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EARNINGS_WINDOW,
  aggregateEarnings,
  fetchAgentEarnings,
  getWindowStartIso,
  parseAmount,
} from '@/lib/agentEarnings';

/**
 * Unit coverage for the pure earnings helpers that feed the leaderboard.
 * These are the math-side tests — DB-shaped tests for `fetchAgentEarnings`
 * use a minimal QueryBuilder stub so we exercise the real query chain
 * without spinning up a Supabase mock harness.
 */

function isoMinutesAgo(minutes: number, now = new Date()): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

describe('parseAmount', () => {
  it('parses plain numeric strings', () => {
    expect(parseAmount('0.25')).toBeCloseTo(0.25, 10);
    expect(parseAmount('1.5')).toBeCloseTo(1.5, 10);
  });

  it('strips token suffixes like "ETH"', () => {
    expect(parseAmount('0.25 ETH')).toBeCloseTo(0.25, 10);
    expect(parseAmount('12.3456 ETH')).toBeCloseTo(12.3456, 10);
  });

  it('returns 0 for null, empty, and garbage values', () => {
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('n/a')).toBe(0);
    expect(parseAmount('not-a-number')).toBe(0);
  });
});

describe('getWindowStartIso', () => {
  it('returns null for "all"', () => {
    expect(getWindowStartIso('all')).toBeNull();
  });

  it('returns exactly now - 7 days for 7d window', () => {
    const now = new Date('2026-04-10T12:00:00.000Z');
    const iso = getWindowStartIso('7d', now);
    expect(iso).toBe(new Date('2026-04-03T12:00:00.000Z').toISOString());
  });

  it('returns exactly now - 30 days for 30d window', () => {
    const now = new Date('2026-04-10T12:00:00.000Z');
    const iso = getWindowStartIso('30d', now);
    expect(iso).toBe(new Date('2026-03-11T12:00:00.000Z').toISOString());
  });
});

describe('aggregateEarnings', () => {
  it('sums confirmed escrow releases per agent', () => {
    const result = aggregateEarnings([
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsubmitter',
        to: 'agent-a',
        amount: '0.25 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(10),
      },
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsubmitter',
        to: 'agent-a',
        amount: '0.1',
        status: 'confirmed',
        timestamp: isoMinutesAgo(5),
      },
      {
        agent_id: 'agent-b',
        type: 'escrow_release',
        from: '0xsubmitter',
        to: 'agent-b',
        amount: '1.0 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(2),
      },
    ]);

    expect(result.size).toBe(2);
    const a = result.get('agent-a');
    expect(a?.ethEarned).toBeCloseTo(0.35, 10);
    expect(a?.tasksPaid).toBe(2);
    expect(a?.avgReward).toBeCloseTo(0.175, 10);

    const b = result.get('agent-b');
    expect(b?.ethEarned).toBeCloseTo(1.0, 10);
    expect(b?.tasksPaid).toBe(1);
  });

  it('excludes self-directed releases (refunds stored as escrow_release)', () => {
    const result = aggregateEarnings([
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xabc',
        to: '0xabc',
        amount: '0.5 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(10),
      },
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xdef',
        to: '0xghi',
        amount: '0.3 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(5),
      },
    ]);

    const a = result.get('agent-a');
    expect(a?.ethEarned).toBeCloseTo(0.3, 10);
    expect(a?.tasksPaid).toBe(1);
  });

  it('excludes pending and failed transactions', () => {
    const result = aggregateEarnings([
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsub',
        to: 'agent-a',
        amount: '0.5 ETH',
        status: 'pending',
        timestamp: isoMinutesAgo(10),
      },
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsub',
        to: 'agent-a',
        amount: '0.5 ETH',
        status: 'failed',
        timestamp: isoMinutesAgo(5),
      },
    ]);
    expect(result.size).toBe(0);
  });

  it('drops rows with null agent_id', () => {
    const result = aggregateEarnings([
      {
        agent_id: null,
        type: 'escrow_release',
        from: '0xsub',
        to: '0xother',
        amount: '0.5 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(10),
      },
    ]);
    expect(result.size).toBe(0);
  });

  it('drops rows with zero or unparseable amounts', () => {
    const result = aggregateEarnings([
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsub',
        to: 'agent-a',
        amount: '0',
        status: 'confirmed',
        timestamp: isoMinutesAgo(10),
      },
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsub',
        to: 'agent-a',
        amount: 'garbage',
        status: 'confirmed',
        timestamp: isoMinutesAgo(5),
      },
    ]);
    expect(result.size).toBe(0);
  });

  it('ignores rows that are not escrow_release', () => {
    const result = aggregateEarnings([
      {
        agent_id: 'agent-a',
        type: 'escrow_lock',
        from: '0xsub',
        to: 'agent-a',
        amount: '2.0 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(10),
      },
    ]);
    expect(result.size).toBe(0);
  });
});

describe('fetchAgentEarnings', () => {
  type Row = Parameters<typeof aggregateEarnings>[0][number];

  /**
   * Records the exact filter chain so each test can assert that the correct
   * query was built, without having to mock every SupabaseClient method.
   */
  function makeStub(rows: Row[]) {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder: {
      select: (...args: unknown[]) => typeof builder;
      eq: (...args: unknown[]) => typeof builder;
      in: (...args: unknown[]) => typeof builder;
      not: (...args: unknown[]) => typeof builder;
      gte: (...args: unknown[]) => typeof builder;
      order: (...args: unknown[]) => typeof builder;
      limit: (...args: unknown[]) => typeof builder;
      then: Promise<{ data: Row[]; error: null }>['then'];
    } = {
      select: (...args) => { calls.push(['select', ...args]); return builder; },
      eq: (...args) => { calls.push(['eq', ...args]); return builder; },
      in: (...args) => { calls.push(['in', ...args]); return builder; },
      not: (...args) => { calls.push(['not', ...args]); return builder; },
      gte: (...args) => { calls.push(['gte', ...args]); return builder; },
      order: (...args) => { calls.push(['order', ...args]); return builder; },
      limit: (...args) => { calls.push(['limit', ...args]); return builder; },
      then: (resolve, reject) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };

    const supabase = {
      from(table: string) {
        calls.push(['from', table]);
        return builder;
      },
    };

    return { supabase, calls };
  }

  it('applies gte timestamp filter for bounded windows', async () => {
    const now = new Date('2026-04-10T12:00:00.000Z');
    const { supabase, calls } = makeStub([
      {
        agent_id: 'agent-a',
        type: 'escrow_release',
        from: '0xsub',
        to: 'agent-a',
        amount: '0.5 ETH',
        status: 'confirmed',
        timestamp: isoMinutesAgo(60, now),
      },
    ]);

    const result = await fetchAgentEarnings(supabase as never, { window: '7d', now });
    expect(result.size).toBe(1);

    const gteCall = calls.find((call) => call[0] === 'gte');
    expect(gteCall).toBeDefined();
    expect(gteCall?.[1]).toBe('timestamp');
    expect(gteCall?.[2]).toBe(new Date('2026-04-03T12:00:00.000Z').toISOString());
  });

  it('omits gte filter for the "all" window', async () => {
    const { supabase, calls } = makeStub([]);
    await fetchAgentEarnings(supabase as never, { window: 'all' });
    expect(calls.find((call) => call[0] === 'gte')).toBeUndefined();
  });

  it('respects a custom transactionLimit', async () => {
    const { supabase, calls } = makeStub([]);
    await fetchAgentEarnings(supabase as never, { transactionLimit: 500 });
    const limitCall = calls.find((call) => call[0] === 'limit');
    expect(limitCall?.[1]).toBe(500);
  });

  it('throws if the query returns an error', async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (
        resolve: (value: { data: null; error: { message: string } }) => unknown,
      ) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve),
    } as unknown as {
      select: (...args: unknown[]) => typeof builder;
      eq: (...args: unknown[]) => typeof builder;
      in: (...args: unknown[]) => typeof builder;
      not: (...args: unknown[]) => typeof builder;
      gte: (...args: unknown[]) => typeof builder;
      order: (...args: unknown[]) => typeof builder;
      limit: (...args: unknown[]) => typeof builder;
      then: Promise<unknown>['then'];
    };
    const supabase = { from: () => builder };

    await expect(fetchAgentEarnings(supabase as never)).rejects.toThrow(/boom/);
  });
});

describe('DEFAULT_EARNINGS_WINDOW', () => {
  it('is 30d', () => {
    expect(DEFAULT_EARNINGS_WINDOW).toBe('30d');
  });
});
