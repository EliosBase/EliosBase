import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';

// GET /api/admin/overview — operator dashboard with aggregate stats
export async function GET(req: NextRequest) {
  const auth = await requireAdminOrOperator(req, { skipCsrf: true });
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  const [
    { count: activeTasks },
    { count: completedTasks },
    { count: failedTasks },
    { count: executingTasks },
    { count: onlineAgents },
    { count: busyAgents },
    { count: openAlerts },
    { data: recentAudit },
  ] = await Promise.all([
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('current_step', 'Executing'),
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'online'),
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('status', 'busy'),
    supabase.from('security_alerts').select('*', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    tasks: {
      active: activeTasks ?? 0,
      completed: completedTasks ?? 0,
      failed: failedTasks ?? 0,
      executing: executingTasks ?? 0,
    },
    agents: {
      online: onlineAgents ?? 0,
      busy: busyAgents ?? 0,
    },
    openAlerts: openAlerts ?? 0,
    recentAudit: recentAudit ?? [],
  });
}
