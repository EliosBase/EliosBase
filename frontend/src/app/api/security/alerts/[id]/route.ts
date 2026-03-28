import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logAudit, logActivity } from '@/lib/audit';
import { toSecurityAlert } from '@/lib/transforms';

// PATCH /api/security/alerts/[id] — resolve or update an alert
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (typeof body.resolved === 'boolean') updates.resolved = body.resolved;

  const { data, error } = await supabase
    .from('security_alerts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    const status = error ? 500 : 404;
    return NextResponse.json({ error: error ? 'Internal server error' : 'Alert not found' }, { status });
  }

  if (body.resolved) {
    await logAudit({
      action: 'ALERT_RESOLVE',
      actor: auth.session.walletAddress ?? auth.session.userId,
      target: id,
      result: 'ALLOW',
    });
    await logActivity({
      type: 'security',
      message: `Alert resolved: ${data.title}`,
      userId: auth.session.userId,
    });
  }

  return NextResponse.json(toSecurityAlert(data));
}
