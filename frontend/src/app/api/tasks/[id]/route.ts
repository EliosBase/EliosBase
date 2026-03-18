import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTask } from '@/lib/transforms';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, agents(name)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(toTask(data));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (body.currentStep) updates.current_step = body.currentStep;
  if (body.status) updates.status = body.status;
  if (body.assignedAgent) updates.assigned_agent = body.assignedAgent;
  if (body.completedAt) updates.completed_at = body.completedAt;
  if (body.zkProofId) updates.zk_proof_id = body.zkProofId;

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select('*, agents(name)')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Task not found' }, { status: 500 });
  }

  return NextResponse.json(toTask(data));
}
