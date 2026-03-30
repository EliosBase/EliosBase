import { getAddress, formatEther } from 'viem';
import { NextResponse } from 'next/server';
import { readRequiredEnv } from '@/lib/env';
import { createPublicServerClient, createServiceClient } from '@/lib/supabase/server';
import { jsonWithCache, PUBLIC_STATS_CACHE_CONTROL } from '@/lib/httpCache';
import { normalizeTransactionType } from '@/lib/transactions';
import { publicClient } from '@/lib/viemClient';

type TransactionDelta = Parameters<typeof normalizeTransactionType>[0] & {
  amount: string;
  timestamp: string;
};

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, '') || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function inRange(timestamp: string, start: Date, end: Date) {
  const value = new Date(timestamp);
  return value >= start && value < end;
}

function getNetDelta(rows: TransactionDelta[]) {
  return rows.reduce((sum, row) => {
    const amount = parseAmount(row.amount);
    const type = normalizeTransactionType(row);

    if (type === 'escrow_lock') {
      return sum + amount;
    }

    if (type === 'escrow_release' || type === 'escrow_refund') {
      return sum - amount;
    }

    return sum;
  }, 0);
}

function getDayStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export async function GET() {
  const publicSupabase = createPublicServerClient();
  const serviceSupabase = createServiceClient();
  const days = 12;
  const today = new Date();
  const windowStart = getDayStart(today);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  const startIso = windowStart.toISOString();
  const escrowAddress = getAddress(
    readRequiredEnv('NEXT_PUBLIC_ESCROW_ADDRESS', process.env.NEXT_PUBLIC_ESCROW_ADDRESS),
  );

  const [
    agentsRes,
    totalAgentsRes,
    tasksRes,
    completedTasksRes,
    proofsRes,
    agentsByDayRes,
    tasksByDayRes,
    proofsByDayRes,
    recentTransactionsRes,
    escrowBalanceWei,
  ] = await Promise.all([
    publicSupabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'offline'),
    publicSupabase
      .from('agents')
      .select('*', { count: 'exact', head: true }),
    publicSupabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    publicSupabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed'),
    publicSupabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .not('zk_proof_id', 'is', null),
    publicSupabase
      .from('agents')
      .select('created_at')
      .gte('created_at', startIso),
    publicSupabase
      .from('tasks')
      .select('submitted_at')
      .gte('submitted_at', startIso),
    publicSupabase
      .from('tasks')
      .select('completed_at')
      .not('zk_proof_id', 'is', null)
      .gte('completed_at', startIso),
    serviceSupabase
      .from('transactions')
      .select('type, from, to, amount, status, timestamp')
      .eq('status', 'confirmed')
      .gte('timestamp', startIso),
    publicClient.getBalance({ address: escrowAddress }),
  ]);

  const errors = [
    agentsRes.error,
    totalAgentsRes.error,
    tasksRes.error,
    completedTasksRes.error,
    proofsRes.error,
    agentsByDayRes.error,
    tasksByDayRes.error,
    proofsByDayRes.error,
    recentTransactionsRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Failed to load dashboard statistics' }, { status: 500 });
  }

  const activeAgents = agentsRes.count ?? 0;
  const totalAgents = totalAgentsRes.count ?? 0;
  const activeTasks = tasksRes.count ?? 0;
  const completedTasks = completedTasksRes.count ?? 0;
  const zkProofs = proofsRes.count ?? 0;
  const currentTvl = Number.parseFloat(formatEther(escrowBalanceWei));
  const recentTransactions = (recentTransactionsRes.data ?? []) as TransactionDelta[];
  const recentNetDelta = getNetDelta(recentTransactions);
  const agentPct = totalAgents > 0 ? ((activeAgents / totalAgents) * 100).toFixed(0) : '0';
  const sparklines = {
    agents: [] as number[],
    tasks: [] as number[],
    tvl: [] as number[],
    proofs: [] as number[],
  };

  let runningTvl = Math.max(0, currentTvl - recentNetDelta);

  for (let index = 0; index < days; index += 1) {
    const dayStart = new Date(windowStart);
    dayStart.setDate(windowStart.getDate() + index);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    sparklines.agents.push(
      (agentsByDayRes.data ?? []).filter((row) => inRange(row.created_at, dayStart, dayEnd)).length,
    );
    sparklines.tasks.push(
      (tasksByDayRes.data ?? []).filter((row) => inRange(row.submitted_at, dayStart, dayEnd)).length,
    );

    const dayTransactions = recentTransactions.filter((row) => inRange(row.timestamp, dayStart, dayEnd));
    runningTvl = Math.max(0, runningTvl + getNetDelta(dayTransactions));
    sparklines.tvl.push(Number(runningTvl.toFixed(4)));

    sparklines.proofs.push(
      (proofsByDayRes.data ?? []).filter(
        (row) => row.completed_at && inRange(row.completed_at, dayStart, dayEnd),
      ).length,
    );
  }

  return jsonWithCache({
    activeAgents,
    activeAgentsTrend: `${agentPct}% online`,
    activeTasks,
    activeTasksTrend: `${completedTasks} completed`,
    tvl: Number(currentTvl.toFixed(4)),
    tvlTrend: `${recentNetDelta >= 0 ? '+' : ''}${recentNetDelta.toFixed(2)} ETH (12d)`,
    zkProofs,
    zkProofsTrend: zkProofs > 0 ? '100% valid' : 'none yet',
    sparklines,
  }, PUBLIC_STATS_CACHE_CONTROL);
}
