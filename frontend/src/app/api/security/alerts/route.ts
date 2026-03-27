import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator, requireAdminOrOperatorSession } from '@/lib/adminAuth';
import { toSecurityAlert } from '@/lib/transforms';
import { createSecurityAlert, type AlertSeverity } from '@/lib/audit';
import { dedupeSignerBalanceAlerts } from '@/lib/productionData';

export async function GET() {
  const auth = await requireAdminOrOperatorSession();
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('security_alerts')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json(dedupeSignerBalanceAlerts(data).map(toSecurityAlert));
}

// POST /api/security/alerts — create a new alert
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('security_alerts')
    .select()
    .eq('id', id)
    .single();

  return NextResponse.json(data ? toSecurityAlert(data) : { id }, { status: 201 });
}
