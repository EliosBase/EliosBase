import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTransactionType } from './transactions';
import type { LeaderboardWindow } from './types/leaderboard';

/**
 * Agent earnings aggregation.
 *
 * Public agent stats (ETH earned, tasks paid, leaderboard rank) are derived
 * from the `transactions` table, which is NOT publicly readable via RLS.
 * Every caller in this module MUST be invoked with a service-role client.
 *
 * We treat confirmed `escrow_release` rows (after `normalizeTransactionType`
 * filters out self-refunds) as the canonical payout signal. Amounts are stored
 * as strings in the DB (e.g. `"0.25"` or `"0.25 ETH"`); we parse them into
 * numeric ETH values using the same `parseAmount` shape as `/api/stats`.
 *
 * None of these helpers issue HTTP calls directly — they're pure aggregation
 * over rows the caller has already fetched when possible, so they can be
 * reused by both the leaderboard route and the per-agent earnings chart.
 */

export type EarningsWindow = LeaderboardWindow;

export const DEFAULT_EARNINGS_WINDOW: EarningsWindow = '30d';

const WINDOW_DAYS: Record<Exclude<EarningsWindow, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
};

export type AgentEarningsRow = {
  agentId: string;
  ethEarned: number;
  tasksPaid: number;
  avgReward: number;
};

type TransactionRow = {
  agent_id: string | null;
  type: string;
  from: string;
  to: string;
  amount: string;
  status: string;
  timestamp: string;
  token?: string;
};

type TransactionsFetcher = Pick<SupabaseClient, 'from'>;

/**
 * Parse a DB-stored transaction amount. Rows historically store either
 * `"0.25"` or `"0.25 ETH"` depending on which writer produced them, and
 * occasional garbage (`"n/a"`) still creeps in from legacy rows. We defensively
 * strip anything non-numeric (keeping `.`) before parsing, and return `0` on
 * NaN so bad rows can never poison the aggregate.
 */
export function parseAmount(value: string | null | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resolve the ISO start timestamp for a given earnings window. Returns
 * `null` for `'all'`, which callers treat as "no lower bound". Windows are
 * measured as a fixed `now - N days` rather than calendar-aligned so that
 * a 30d leaderboard updates continuously throughout the day rather than
 * jumping at midnight UTC.
 */
export function getWindowStartIso(
  window: EarningsWindow,
  now: Date = new Date(),
): string | null {
  if (window === 'all') return null;
  const days = WINDOW_DAYS[window];
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString();
}

/**
 * Aggregate a set of transaction rows into per-agent earnings. Only confirmed
 * `escrow_release` rows that `normalizeTransactionType` does NOT reclassify as
 * `escrow_refund` count toward earnings — self-refunds from the escrow vault
 * back to the submitter must not appear on an agent's ledger.
 *
 * Returns a Map keyed by `agent_id` so callers can join into the agents list
 * without a second DB round trip. Rows without an `agent_id` are dropped.
 */
export function aggregateEarnings(rows: TransactionRow[]): Map<string, AgentEarningsRow> {
  const byAgent = new Map<string, AgentEarningsRow>();

  for (const row of rows) {
    if (!row.agent_id) continue;
    if (row.status !== 'confirmed') continue;

    const effectiveType = normalizeTransactionType({
      type: row.type as 'escrow_release' | 'escrow_refund',
      from: row.from,
      to: row.to,
    });
    if (effectiveType !== 'escrow_release') continue;

    const amount = parseAmount(row.amount);
    if (amount <= 0) continue;

    const existing = byAgent.get(row.agent_id);
    if (existing) {
      existing.ethEarned += amount;
      existing.tasksPaid += 1;
      existing.avgReward = existing.ethEarned / existing.tasksPaid;
    } else {
      byAgent.set(row.agent_id, {
        agentId: row.agent_id,
        ethEarned: amount,
        tasksPaid: 1,
        avgReward: amount,
      });
    }
  }

  return byAgent;
}

/**
 * Fetch and aggregate earnings for the given window across every agent.
 *
 * Uses a single service-role query over `transactions` rather than N+1 per
 * agent. We cap the fetched row count at `transactionLimit` (default 10k) to
 * protect the edge from unbounded scans on long-running accounts; if the cap
 * is hit the aggregation is still stable, just bounded to the most recent
 * transactions in the window.
 */
export async function fetchAgentEarnings(
  supabase: TransactionsFetcher,
  options: {
    window?: EarningsWindow;
    now?: Date;
    transactionLimit?: number;
  } = {},
): Promise<Map<string, AgentEarningsRow>> {
  const window = options.window ?? DEFAULT_EARNINGS_WINDOW;
  const now = options.now ?? new Date();
  const startIso = getWindowStartIso(window, now);
  const transactionLimit = options.transactionLimit ?? 10_000;

  let query = supabase
    .from('transactions')
    .select('agent_id, type, from, to, amount, status, timestamp, token')
    .eq('status', 'confirmed')
    .in('type', ['escrow_release', 'escrow_refund'])
    .not('agent_id', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(transactionLimit);

  if (startIso) {
    query = query.gte('timestamp', startIso);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch agent earnings: ${error.message}`);
  }

  return aggregateEarnings((data ?? []) as TransactionRow[]);
}

/**
 * Build per-day earnings for a single agent across the most recent `days`
 * days. Each bucket is `YYYY-MM-DD` anchored at local-UTC midnight; days with
 * zero activity are emitted with zeros so the client can render a gap-free
 * sparkline without resampling.
 *
 * Buckets are ordered oldest → newest so the returned array drops straight
 * into a chart without reversal. The cap on transactions fetched is
 * intentionally low (2k) since this is per-agent — a single agent with more
 * than 2k confirmed payouts in a month would be a strong signal on its own.
 */
export async function fetchAgentDailyEarnings(
  supabase: TransactionsFetcher,
  agentId: string,
  options: { days?: number; now?: Date } = {},
): Promise<Array<{ date: string; ethEarned: number; tasksPaid: number }>> {
  const days = options.days ?? 30;
  const now = options.now ?? new Date();

  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowStart = new Date(anchor.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('transactions')
    .select('agent_id, type, from, to, amount, status, timestamp, token')
    .eq('status', 'confirmed')
    .eq('agent_id', agentId)
    .in('type', ['escrow_release', 'escrow_refund'])
    .gte('timestamp', windowStart.toISOString())
    .order('timestamp', { ascending: true })
    .limit(2_000);

  if (error) {
    throw new Error(`Failed to fetch daily earnings for ${agentId}: ${error.message}`);
  }

  const buckets: Array<{ date: string; ethEarned: number; tasksPaid: number }> = [];
  for (let index = 0; index < days; index += 1) {
    const bucketDate = new Date(windowStart.getTime() + index * 24 * 60 * 60 * 1000);
    buckets.push({
      date: bucketDate.toISOString().slice(0, 10),
      ethEarned: 0,
      tasksPaid: 0,
    });
  }

  const rows = (data ?? []) as TransactionRow[];
  for (const row of rows) {
    if (row.status !== 'confirmed') continue;
    const effectiveType = normalizeTransactionType({
      type: row.type as 'escrow_release' | 'escrow_refund',
      from: row.from,
      to: row.to,
    });
    if (effectiveType !== 'escrow_release') continue;

    const amount = parseAmount(row.amount);
    if (amount <= 0) continue;

    const bucketIsoDay = row.timestamp.slice(0, 10);
    const bucket = buckets.find((entry) => entry.date === bucketIsoDay);
    if (!bucket) continue;

    bucket.ethEarned += amount;
    bucket.tasksPaid += 1;
  }

  return buckets;
}
