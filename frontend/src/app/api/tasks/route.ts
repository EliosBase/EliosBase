import { NextRequest, NextResponse } from 'next/server';
import { createPublicServerClient, createServiceClient, createUserServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTask } from '@/lib/transforms';
import { logAudit, logActivity, checkSpendingLimit, parseRewardAmount, generateId } from '@/lib/audit';
import { validateOrigin } from '@/lib/csrf';
import { createTaskSchema } from '@/lib/schemas/task';
import { getTaskIdFromDisputeSource } from '@/lib/taskDisputes';
import { parsePagination } from '@/lib/pagination';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  const publicSupabase = createPublicServerClient();
  const serviceSupabase = createServiceClient();
  const { searchParams } = req.nextUrl;
  const { limit, offset } = parsePagination(searchParams);

  let query = publicSupabase.from('tasks').select('*, agents(name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address))');

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);

  const [{ data, error }, disputesRes] = await Promise.all([
    query.order('submitted_at', { ascending: false }).range(offset, offset + limit - 1),
    serviceSupabase
      .from('security_alerts')
      .select('source')
      .eq('resolved', false)
      .limit(200),
  ]);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  const openDisputes = new Set(
    (disputesRes.data ?? [])
      .map((alert) => getTaskIdFromDisputeSource(alert.source))
      .filter((taskId): taskId is string => !!taskId),
  );

  return jsonWithCache(
    data.map((task) => toTask({
      ...task,
      has_open_dispute: openDisputes.has(task.id),
    })),
    PUBLIC_COLLECTION_CACHE_CONTROL,
  );
}

export async function POST(req: NextRequest) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.taskCreate, session.userId);
  if (rateLimitError) return rateLimitError;

  const raw = await req.json();
  const parsed = createTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = createUserServerClient();

  // Guardrail: check spending limit before allowing task creation
  const rewardNum = parseRewardAmount(body.reward);
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

  const id = generateId('task');
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
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
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
