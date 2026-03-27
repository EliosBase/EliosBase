import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { createSecurityAlert, type AlertSeverity } from '@/lib/audit';
import { createServiceClient } from '@/lib/supabase/server';
import { toSecurityAlert } from '@/lib/transforms';

// POST /api/security/alerts/create — programmatically create an alert
export async function POST(req: NextRequest) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const body = await req.json();

  if (!body.severity || !body.title || !body.description || !body.source) {
    return NextResponse.json(
      { error: 'Missing required fields: severity, title, description, source' },
      { status: 400 }
    );
  }

  const { id, error } = await createSecurityAlert({
    severity: body.severity as AlertSeverity,
    title: body.title,
    description: body.description,
    source: body.source,
    actor: auth.session.walletAddress ?? auth.session.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch the created alert to return it
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('security_alerts')
    .select()
    .eq('id', id)
    .single();

  return NextResponse.json(data ? toSecurityAlert(data) : { id }, { status: 201 });
}
