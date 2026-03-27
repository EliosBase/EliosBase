import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: mocks.createServiceClient }));

const { GET } = await import('@/app/api/stats/route');

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

class QueryBuilder<T extends Record<string, unknown>> {
  private filters: Array<(row: T) => boolean> = [];
  private head = false;

  constructor(private readonly rows: T[]) {}

  select(_columns: string, options?: { head?: boolean }) {
    this.head = !!options?.head;
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

  lt(column: keyof T & string, value: unknown) {
    this.filters.push((row) => String(row[column] ?? '') < String(value));
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data?: T[]; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const filtered = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    const result = this.head ? { count: filtered.length } : { data: filtered };
    return Promise.resolve(result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

function makeSupabase(data: {
  agents: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
}) {
  return {
    from(table: 'agents' | 'tasks' | 'transactions') {
      return new QueryBuilder(data[table]);
    },
  };
}

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('clamps tvl and sparkline points to zero when releases exceed locks', async () => {
    mocks.createServiceClient.mockReturnValue(makeSupabase({
      agents: [
        { status: 'online', created_at: isoDaysAgo(9) },
        { status: 'offline', created_at: isoDaysAgo(4) },
      ],
      tasks: [
        { status: 'active', submitted_at: isoDaysAgo(2), completed_at: null, zk_proof_id: null },
        { status: 'completed', submitted_at: isoDaysAgo(8), completed_at: isoDaysAgo(1), zk_proof_id: 'proof-1' },
      ],
      transactions: [
        { type: 'escrow_lock', status: 'confirmed', amount: '0.50 ETH', timestamp: isoDaysAgo(13) },
        { type: 'escrow_release', status: 'confirmed', amount: '1.10 ETH', timestamp: isoDaysAgo(13) },
        { type: 'escrow_release', status: 'confirmed', amount: '0.40 ETH', timestamp: isoDaysAgo(2) },
        { type: 'escrow_lock', status: 'confirmed', amount: '0.20 ETH', timestamp: isoDaysAgo(1) },
        { type: 'escrow_release', status: 'confirmed', amount: '0.50 ETH', timestamp: isoDaysAgo(0) },
      ],
    }));

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tvl).toBe(0);
    expect(json.sparklines.tvl.every((point: number) => point >= 0)).toBe(true);
  });

  it('carries forward pre-window locked value into the tvl sparkline', async () => {
    mocks.createServiceClient.mockReturnValue(makeSupabase({
      agents: [],
      tasks: [],
      transactions: [
        { type: 'escrow_lock', status: 'confirmed', amount: '1.00 ETH', timestamp: isoDaysAgo(13) },
        { type: 'escrow_release', status: 'confirmed', amount: '0.25 ETH', timestamp: isoDaysAgo(5) },
        { type: 'escrow_lock', status: 'confirmed', amount: '0.10 ETH', timestamp: isoDaysAgo(3) },
      ],
    }));

    const res = await GET();
    const json = await res.json();

    expect(json.tvl).toBeCloseTo(0.85, 5);
    expect(json.sparklines.tvl.at(-1)).toBeCloseTo(0.85, 5);
    expect(json.sparklines.tvl.every((point: number) => point >= 0)).toBe(true);
  });
});
