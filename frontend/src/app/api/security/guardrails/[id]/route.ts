import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity } from '@/lib/audit';
import { toGuardrail } from '@/lib/transforms';

// PATCH /api/security/guardrails/[id] — toggle guardrail status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (body.status && ['active', 'paused', 'triggered'].includes(body.status)) {
    updates.status = body.status;
  }

  const { data, error } = await supabase
    .from('guardrails')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Guardrail not found' }, { status: 500 });
  }

  await logAudit({
    action: 'GUARDRAIL_TOGGLE',
    actor: session.walletAddress ?? session.userId,
    target: `guardrail:${data.name}`,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'security',
    message: `Guardrail "${data.name}" set to ${body.status}`,
    userId: session.userId,
  });

  return NextResponse.json(toGuardrail(data));
}
