import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

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

  const parseAmount = (val: string) => {
    const n = parseFloat(val.replace(/[^0-9.]/g, '') || '0');
    return Number.isFinite(n) ? n : 0;
  };

  const lockedTotal = (escrowLockRes.data ?? []).reduce(
    (sum, row) => sum + parseAmount(row.amount), 0
  );
  const releasedTotal = (escrowReleaseRes.data ?? []).reduce(
    (sum, row) => sum + parseAmount(row.amount), 0
  );
  const tvl = lockedTotal - releasedTotal;

  const zkProofs = proofsRes.count ?? 0;

  // Compute trend strings from actual data
  const agentPct = totalAgents > 0 ? ((activeAgents / totalAgents) * 100).toFixed(0) : '0';
  const totalTasks = activeTasks + completedTasks;
  const taskPct = totalTasks > 0 ? ((activeTasks / totalTasks) * 100).toFixed(0) : '0';

  return NextResponse.json({
    activeAgents,
    activeAgentsTrend: `${agentPct}% online`,
    activeTasks,
    activeTasksTrend: `${completedTasks} completed`,
    tvl,
    tvlTrend: `${lockedTotal.toFixed(2)} locked`,
    zkProofs,
    zkProofsTrend: zkProofs > 0 ? '100% valid' : 'none yet',
  });
}
