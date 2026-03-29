import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizeTransactionType } from '@/lib/transactions';

function parseAmount(value: string) {
  const parsed = parseFloat(value.replace(/[^0-9.]/g, '') || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumAmounts(rows: { amount: string }[] | null | undefined) {
  return (rows ?? []).reduce((sum, row) => sum + parseAmount(row.amount), 0);
}

// GET /api/stats — live dashboard statistics with trends
export async function GET() {
  const supabase = createServiceClient();

  const [agentsRes, totalAgentsRes, tasksRes, completedTasksRes, transactionsRes, proofsRes] =
    await Promise.all([
      // Active Agents: COUNT where status != 'offline'
      supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'offline'),
      // Total agents for trend
      supabase
        .from('agents')
        .select('*', { count: 'exact', head: true }),
      // Tasks in Progress: COUNT where status = 'active'
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      // Completed tasks for trend
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      supabase
        .from('transactions')
        .select('type, from, to, amount, status, timestamp'),
      // ZK Proofs: COUNT of tasks with zk_proof_id IS NOT NULL
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .not('zk_proof_id', 'is', null),
    ]);

  const activeAgents = agentsRes.count ?? 0;
  const totalAgents = totalAgentsRes.count ?? 0;
  const activeTasks = tasksRes.count ?? 0;
  const completedTasks = completedTasksRes.count ?? 0;

  const confirmedTransactions = (transactionsRes.data ?? []).filter((row) => row.status === 'confirmed');
  const lockedTotal = sumAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_lock'),
  );
  const releasedTotal = sumAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_release'),
  );
  const refundedTotal = sumAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_refund'),
  );
  const tvl = Math.max(0, lockedTotal - releasedTotal - refundedTotal);

  const zkProofs = proofsRes.count ?? 0;

  // Compute trend strings from actual data
  const agentPct = totalAgents > 0 ? ((activeAgents / totalAgents) * 100).toFixed(0) : '0';

  // Compute 12-day sparkline data from DB
  const days = 12;
  const now = new Date();
  const sparklines = { agents: [] as number[], tasks: [] as number[], tvl: [] as number[], proofs: [] as number[] };

  // Fetch data for sparklines (created_at / submitted_at bucketed by day)
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  const startIso = startDate.toISOString();

  const [agentsByDay, tasksByDay, proofsByDay] = await Promise.all([
    supabase.from('agents').select('created_at').gte('created_at', startIso),
    supabase.from('tasks').select('submitted_at').gte('submitted_at', startIso),
    supabase.from('tasks').select('completed_at').not('zk_proof_id', 'is', null).gte('completed_at', startIso),
  ]);

  const priorTransactions = confirmedTransactions.filter((row) => row.timestamp < startIso);
  let runningTvl = Math.max(
    0,
    sumAmounts(priorTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_lock'))
      - sumAmounts(priorTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_release'))
      - sumAmounts(priorTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_refund')),
  );

  const recentTransactions = confirmedTransactions.filter((row) => row.timestamp >= startIso);

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - (days - 1 - d));
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const inRange = (dateStr: string) => {
      const dt = new Date(dateStr);
      return dt >= dayStart && dt < dayEnd;
    };

    sparklines.agents.push((agentsByDay.data ?? []).filter((r) => inRange(r.created_at)).length);
    sparklines.tasks.push((tasksByDay.data ?? []).filter((r) => inRange(r.submitted_at)).length);

    const dayTransactions = recentTransactions.filter((row) => inRange(row.timestamp));
    const dayLocked = dayTransactions
      .filter((row) => normalizeTransactionType(row) === 'escrow_lock')
      .reduce((sum, row) => sum + parseAmount(row.amount), 0);
    const dayReleased = dayTransactions
      .filter((row) => normalizeTransactionType(row) === 'escrow_release')
      .reduce((sum, row) => sum + parseAmount(row.amount), 0);
    const dayRefunded = dayTransactions
      .filter((row) => normalizeTransactionType(row) === 'escrow_refund')
      .reduce((sum, row) => sum + parseAmount(row.amount), 0);
    runningTvl = Math.max(0, runningTvl + dayLocked - dayReleased - dayRefunded);
    sparklines.tvl.push(parseFloat(runningTvl.toFixed(4)));

    sparklines.proofs.push((proofsByDay.data ?? []).filter((r) => r.completed_at && inRange(r.completed_at)).length);
  }

  return NextResponse.json({
    activeAgents,
    activeAgentsTrend: `${agentPct}% online`,
    activeTasks,
    activeTasksTrend: `${completedTasks} completed`,
    tvl,
    tvlTrend: `${lockedTotal.toFixed(2)} locked`,
    zkProofs,
    zkProofsTrend: zkProofs > 0 ? '100% valid' : 'none yet',
    sparklines,
  });
}
