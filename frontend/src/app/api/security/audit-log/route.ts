import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperatorSession } from '@/lib/adminAuth';
import { toAuditLogEntry } from '@/lib/transforms';

export async function GET() {
  const auth = await requireAdminOrOperatorSession();
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json(data.map(toAuditLogEntry));
}
