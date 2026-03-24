import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: task, error } = await supabase
    .from('tasks')
    .select('submitter_id, execution_result')
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const canView = task.submitter_id === session.userId || session.role === 'admin';
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!task.execution_result) {
    return NextResponse.json({ error: 'Task result not available' }, { status: 404 });
  }

  await logAudit({
    action: 'TASK_RESULT_VIEW',
    actor: session.walletAddress ?? session.userId,
    target: id,
    result: 'ALLOW',
  });

  return NextResponse.json(task.execution_result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
