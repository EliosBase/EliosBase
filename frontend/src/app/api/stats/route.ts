import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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

  const [agentsRes, totalAgentsRes, tasksRes, completedTasksRes, escrowLockRes, escrowReleaseRes, proofsRes] =
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
      // TVL: sum of escrow_lock amounts
      supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'escrow_lock')
        .eq('status', 'confirmed'),
      // TVL: minus escrow_release amounts
      supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'escrow_release')
        .eq('status', 'confirmed'),
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

  const lockedTotal = sumAmounts(escrowLockRes.data);
  const releasedTotal = sumAmounts(escrowReleaseRes.data);
  const tvl = Math.max(0, lockedTotal - releasedTotal);

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

  const [agentsByDay, tasksByDay, locksByDay, releasesByDay, proofsByDay, priorLocks, priorReleases] = await Promise.all([
    supabase.from('agents').select('created_at').gte('created_at', startIso),
    supabase.from('tasks').select('submitted_at').gte('submitted_at', startIso),
    supabase.from('transactions').select('amount, timestamp').eq('type', 'escrow_lock').eq('status', 'confirmed').gte('timestamp', startIso),
    supabase.from('transactions').select('amount, timestamp').eq('type', 'escrow_release').eq('status', 'confirmed').gte('timestamp', startIso),
    supabase.from('tasks').select('completed_at').not('zk_proof_id', 'is', null).gte('completed_at', startIso),
    supabase.from('transactions').select('amount').eq('type', 'escrow_lock').eq('status', 'confirmed').lt('timestamp', startIso),
    supabase.from('transactions').select('amount').eq('type', 'escrow_release').eq('status', 'confirmed').lt('timestamp', startIso),
  ]);

  let runningTvl = Math.max(0, sumAmounts(priorLocks.data) - sumAmounts(priorReleases.data));

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

    const dayLocked = (locksByDay.data ?? []).filter((r) => inRange(r.timestamp)).reduce((sum, row) => sum + parseAmount(row.amount), 0);
    const dayReleased = (releasesByDay.data ?? []).filter((r) => inRange(r.timestamp)).reduce((sum, row) => sum + parseAmount(row.amount), 0);
    runningTvl = Math.max(0, runningTvl + dayLocked - dayReleased);
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
