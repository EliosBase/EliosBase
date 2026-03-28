import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';
import { toGuardrail } from '@/lib/transforms';

const VALID_STATUSES = ['active', 'paused', 'triggered'];

// PATCH /api/security/guardrails/[id] — toggle guardrail status (operator/admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const body = await req.json();

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('guardrails')
    .update({ status: body.status })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    const status = error ? 500 : 404;
    return NextResponse.json({ error: error ? 'Internal server error' : 'Guardrail not found' }, { status });
  }

  await logAudit({
    action: 'GUARDRAIL_TOGGLE',
    actor: auth.session.walletAddress ?? auth.session.userId,
    target: `guardrail:${data.name}`,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'security',
    message: `Guardrail "${data.name}" set to ${body.status}`,
    userId: auth.session.userId,
  });

  return NextResponse.json(toGuardrail(data));
}
