import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPublicServerClient: vi.fn(),
  createServiceClient: vi.fn(),
  readJsonCache: vi.fn(),
  writeJsonCache: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createPublicServerClient: mocks.createPublicServerClient,
  createServiceClient: mocks.createServiceClient,
}));

vi.mock('@/lib/cache', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache')>('@/lib/cache');
  return {
    ...actual,
    readJsonCache: mocks.readJsonCache,
    writeJsonCache: mocks.writeJsonCache,
    withJsonCache: async <T,>(
      _ns: string,
      _id: string,
      _ttl: number,
      compute: () => Promise<T>,
    ) => {
      const cached = await mocks.readJsonCache();
      if (cached !== null && cached !== undefined) return cached as T;
      const value = await compute();
      await mocks.writeJsonCache();
      return value;
    },
  };
});

const { GET } = await import('@/app/api/leaderboard/route');

type AgentRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  reputation: number;
  tasks_completed: number;
  wallet_address: string | null;
  price_per_task: string;
};

type TxRow = {
  agent_id: string | null;
  type: string;
  from: string;
  to: string;
  amount: string;
  status: string;
  timestamp: string;
};

/**
 * QueryBuilder — minimal chainable mock supporting every method the real
 * leaderboard query chain uses: select, eq, neq, in, not, gte, order, limit.
 * Each call narrows the row set so the return value in `.then` is what the
 * production code would see from Supabase.
 */
class QueryBuilder<T extends Record<string, unknown>> {
  private filters: Array<(row: T) => boolean> = [];

  constructor(private readonly rows: T[]) {}

  select(_columns: string) {
    void _columns;
    return this;
  }

  eq(column: keyof T & string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: keyof T & string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: keyof T & string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  not(column: keyof T & string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    }
    return this;
  }

  gte(column: keyof T & string, value: unknown) {
    this.filters.push((row) => String(row[column] ?? '') >= String(value));
    return this;
  }

  order(_column: string, _options?: { ascending?: boolean }) {
    void _column;
    void _options;
    return this;
  }

  limit(_count: number) {
    void _count;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const filtered = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve({ data: filtered, error: null }).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

function makePublicSupabase(agents: AgentRow[]) {
  return {
    from(table: string) {
      if (table !== 'agents') {
        throw new Error(`public supabase should only read agents, got ${table}`);
      }
      return new QueryBuilder(agents);
    },
  };
}

function makeServiceSupabase(transactions: TxRow[]) {
  return {
    from(table: string) {
      if (table !== 'transactions') {
        throw new Error(`service supabase should only read transactions, got ${table}`);
      }
      return new QueryBuilder(transactions);
    },
  };
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function makeRequest(url = 'https://example.com/api/leaderboard'): NextRequest {
  return new NextRequest(url);
}

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readJsonCache.mockResolvedValue(null);
    mocks.writeJsonCache.mockResolvedValue(undefined);
  });

  it('ranks agents by ETH earned in the 30d window (default)', async () => {
    mocks.createPublicServerClient.mockReturnValue(
      makePublicSupabase([
        {
          id: 'agent-a',
          name: 'Alpha',
          type: 'research',
          status: 'online',
          reputation: 90,
          tasks_completed: 10,
          wallet_address: '0xAAA',
          price_per_task: '0.1',
        },
        {
          id: 'agent-b',
          name: 'Bravo',
          type: 'research',
          status: 'online',
          reputation: 85,
          tasks_completed: 8,
          wallet_address: '0xBBB',
          price_per_task: '0.1',
        },
      ]),
    );

    mocks.createServiceClient.mockReturnValue(
      makeServiceSupabase([
        {
          agent_id: 'agent-a',
          type: 'escrow_release',
          from: '0xsub',
          to: 'agent-a',
          amount: '0.20 ETH',
          status: 'confirmed',
          timestamp: isoDaysAgo(2),
        },
        {
          agent_id: 'agent-b',
          type: 'escrow_release',
          from: '0xsub',
          to: 'agent-b',
          amount: '0.80 ETH',
          status: 'confirmed',
          timestamp: isoDaysAgo(4),
        },
        {
          agent_id: 'agent-b',
          type: 'escrow_release',
          from: '0xsub',
          to: 'agent-b',
          amount: '0.30 ETH',
          status: 'confirmed',
          timestamp: isoDaysAgo(1),
        },
      ]),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.window).toBe('30d');
    expect(json.totalAgents).toBe(2);
    expect(json.totalEarnedEth).toBeCloseTo(1.3, 5);
    expect(json.entries).toHaveLength(2);

    expect(json.entries[0].rank).toBe(1);
    expect(json.entries[0].agentId).toBe('agent-b');
    expect(json.entries[0].ethEarned).toBeCloseTo(1.1, 5);
    expect(json.entries[0].tasksPaid).toBe(2);

    expect(json.entries[1].rank).toBe(2);
    expect(json.entries[1].agentId).toBe('agent-a');
    expect(json.entries[1].ethEarned).toBeCloseTo(0.2, 5);
    expect(json.entries[1].tasksPaid).toBe(1);
  });

  it('includes zero-earning agents so newcomers are visible', async () => {
    mocks.createPublicServerClient.mockReturnValue(
      makePublicSupabase([
        {
          id: 'agent-new',
          name: 'Newcomer',
          type: 'research',
          status: 'online',
          reputation: 0,
          tasks_completed: 0,
          wallet_address: '0xNEW',
          price_per_task: '0.05',
        },
      ]),
    );
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].ethEarned).toBe(0);
    expect(json.entries[0].tasksPaid).toBe(0);
    expect(json.entries[0].rank).toBe(1);
  });

  it('excludes suspended agents', async () => {
    mocks.createPublicServerClient.mockReturnValue(
      makePublicSupabase([
        {
          id: 'agent-live',
          name: 'Live',
          type: 'research',
          status: 'online',
          reputation: 50,
          tasks_completed: 3,
          wallet_address: '0xLIVE',
          price_per_task: '0.05',
        },
        {
          id: 'agent-dead',
          name: 'Banned',
          type: 'research',
          status: 'suspended',
          reputation: 10,
          tasks_completed: 1,
          wallet_address: '0xDEAD',
          price_per_task: '0.05',
        },
      ]),
    );
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].agentId).toBe('agent-live');
  });

  it('breaks earnings ties deterministically (reputation → tasks → name)', async () => {
    mocks.createPublicServerClient.mockReturnValue(
      makePublicSupabase([
        {
          id: 'charlie',
          name: 'Charlie',
          type: 'research',
          status: 'online',
          reputation: 50,
          tasks_completed: 5,
          wallet_address: '0xCCC',
          price_per_task: '0.1',
        },
        {
          id: 'alpha',
          name: 'Alpha',
          type: 'research',
          status: 'online',
          reputation: 50,
          tasks_completed: 5,
          wallet_address: '0xAAA',
          price_per_task: '0.1',
        },
        {
          id: 'bravo',
          name: 'Bravo',
          type: 'research',
          status: 'online',
          reputation: 70,
          tasks_completed: 5,
          wallet_address: '0xBBB',
          price_per_task: '0.1',
        },
      ]),
    );
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest());
    const json = await res.json();
    // Bravo wins on reputation, then Alpha beats Charlie on name alphabetical.
    expect(json.entries.map((e: { agentId: string }) => e.agentId)).toEqual([
      'bravo',
      'alpha',
      'charlie',
    ]);
  });

  it('honors the limit query param without changing the cached shape', async () => {
    mocks.createPublicServerClient.mockReturnValue(
      makePublicSupabase(
        Array.from({ length: 5 }, (_, index) => ({
          id: `agent-${index}`,
          name: `Agent ${index}`,
          type: 'research',
          status: 'online',
          reputation: 100 - index,
          tasks_completed: 10 - index,
          wallet_address: `0x${index}`,
          price_per_task: '0.1',
        })),
      ),
    );
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest('https://example.com/api/leaderboard?limit=2'));
    const json = await res.json();
    expect(json.totalAgents).toBe(5);
    expect(json.entries).toHaveLength(2);
    expect(json.entries[0].rank).toBe(1);
    expect(json.entries[1].rank).toBe(2);
  });

  it('clamps limit to 100 max', async () => {
    mocks.createPublicServerClient.mockReturnValue(
      makePublicSupabase(
        Array.from({ length: 3 }, (_, index) => ({
          id: `agent-${index}`,
          name: `Agent ${index}`,
          type: 'research',
          status: 'online',
          reputation: 100,
          tasks_completed: 1,
          wallet_address: `0x${index}`,
          price_per_task: '0.1',
        })),
      ),
    );
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest('https://example.com/api/leaderboard?limit=9999'));
    expect(res.status).toBe(200);
    const json = await res.json();
    // Only 3 agents exist; the cap doesn't filter further.
    expect(json.entries).toHaveLength(3);
  });

  it('accepts "7d" and "all" as valid windows and rejects garbage', async () => {
    mocks.createPublicServerClient.mockReturnValue(makePublicSupabase([]));
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const seven = await GET(makeRequest('https://example.com/api/leaderboard?window=7d'));
    expect((await seven.json()).window).toBe('7d');

    const all = await GET(makeRequest('https://example.com/api/leaderboard?window=all'));
    expect((await all.json()).window).toBe('all');

    const garbage = await GET(
      makeRequest('https://example.com/api/leaderboard?window=nonsense'),
    );
    expect((await garbage.json()).window).toBe('30d');
  });

  it('returns the cached payload without hitting the database on cache hit', async () => {
    mocks.readJsonCache.mockResolvedValueOnce({
      window: '30d',
      generatedAt: new Date().toISOString(),
      totalAgents: 1,
      totalEarnedEth: 0.5,
      entries: [
        {
          rank: 1,
          agentId: 'cached',
          name: 'Cached',
          type: 'research',
          status: 'online',
          reputation: 10,
          tasksCompleted: 1,
          walletAddress: null,
          ethEarned: 0.5,
          tasksPaid: 1,
          avgReward: 0.5,
          pricePerTask: '0.1',
        },
      ],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entries[0].agentId).toBe('cached');
    // The DB clients must not have been built at all on a cache hit.
    expect(mocks.createPublicServerClient).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('returns a 500 when the agents query errors', async () => {
    mocks.createPublicServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          neq: () => Promise.resolve({ data: null, error: { message: 'db dead' } }),
        }),
      }),
    });
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/db dead|Failed to fetch agents/);
  });

  it('sets a public Cache-Control header on success', async () => {
    mocks.createPublicServerClient.mockReturnValue(makePublicSupabase([]));
    mocks.createServiceClient.mockReturnValue(makeServiceSupabase([]));

    const res = await GET(makeRequest());
    const cacheControl = res.headers.get('cache-control') ?? '';
    expect(cacheControl).toMatch(/public/);
    expect(cacheControl).toMatch(/s-maxage=\d+/);
  });
});
