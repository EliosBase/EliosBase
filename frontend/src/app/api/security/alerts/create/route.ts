import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { createSecurityAlert } from '@/lib/audit';
import { createServiceClient } from '@/lib/supabase/server';
import { toSecurityAlert } from '@/lib/transforms';
import { createAlertSchema } from '@/lib/schemas/security';

// POST /api/security/alerts/create — programmatically create an alert
export async function POST(req: NextRequest) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const raw = await req.json();
  const parsed = createAlertSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const body = parsed.data;

  const { id, error } = await createSecurityAlert({
    severity: body.severity,
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
