import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { logAudit, logActivity } from '@/lib/audit';
import { toSecurityAlert } from '@/lib/transforms';

// PATCH /api/security/alerts/[id] — resolve or update an alert
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Role check: only operator or admin can resolve alerts
  if (session.role && session.role === 'submitter') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

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
      actor: session.walletAddress ?? session.userId,
      target: id,
      result: 'ALLOW',
    });
    await logActivity({
      type: 'security',
      message: `Alert resolved: ${data.title}`,
      userId: session.userId,
    });
  }

  return NextResponse.json(toSecurityAlert(data));
}
