import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTask } from '@/lib/transforms';
import { logAudit, logActivity, checkSpendingLimit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = req.nextUrl;

  let query = supabase.from('tasks').select('*, agents(name)');

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('submitted_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data.map(toTask));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();

  // Guardrail: check spending limit before allowing task creation
  const rewardNum = parseFloat(body.reward?.replace(/[^0-9.]/g, '') || '0');
  const { allowed } = await checkSpendingLimit(rewardNum);
  if (!allowed) {
    await logAudit({
      action: 'SPENDING_LIMIT',
      actor: session.walletAddress ?? session.userId!,
      target: `task:${body.title}`,
      result: 'DENY',
    });
    return NextResponse.json(
      { error: 'Task reward exceeds spending limit' },
      { status: 403 }
    );
  }

  const id = `task-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      id,
      title: body.title,
      description: body.description,
      reward: body.reward,
      submitter_id: session.userId,
      current_step: 'Submitted',
      status: 'active',
    })
    .select('*, agents(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit + activity logging
  await logAudit({
    action: 'TASK_CREATE',
    actor: session.walletAddress ?? session.userId!,
    target: id,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'task',
    message: `New task submitted: ${body.title}`,
    userId: session.userId,
  });

  return NextResponse.json(toTask(data), { status: 201 });
}
