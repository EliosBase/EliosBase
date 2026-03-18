import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/stats — live dashboard statistics
export async function GET() {
  const supabase = createServiceClient();

  const [agentsRes, tasksRes, escrowLockRes, escrowReleaseRes, proofsRes] =
    await Promise.all([
      // Active Agents: COUNT where status != 'offline'
      supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'offline'),
      // Tasks in Progress: COUNT where status = 'active'
      supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
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
  const activeTasks = tasksRes.count ?? 0;

  // Calculate TVL from escrow locks minus releases
  const lockedTotal = (escrowLockRes.data ?? []).reduce(
    (sum, row) => sum + parseFloat(row.amount.replace(/[^0-9.]/g, '') || '0'),
    0
  );
  const releasedTotal = (escrowReleaseRes.data ?? []).reduce(
    (sum, row) => sum + parseFloat(row.amount.replace(/[^0-9.]/g, '') || '0'),
    0
  );
  const tvl = lockedTotal - releasedTotal;

  const zkProofs = proofsRes.count ?? 0;

  return NextResponse.json({
    activeAgents,
    activeTasks,
    tvl,
    zkProofs,
  });
}
