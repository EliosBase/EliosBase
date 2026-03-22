import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity } from '@/lib/audit';
import { toGuardrail } from '@/lib/transforms';
import { validateOrigin } from '@/lib/csrf';

const VALID_STATUSES = ['active', 'paused', 'triggered'];

// PATCH /api/security/guardrails/[id] — toggle guardrail status (operator/admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Role check: only operator or admin can toggle guardrails
  if (session.role && session.role === 'submitter') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

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
