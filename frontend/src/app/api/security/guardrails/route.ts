import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperatorSession } from '@/lib/adminAuth';
import { toGuardrail } from '@/lib/transforms';

export async function GET() {
  const auth = await requireAdminOrOperatorSession();
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('guardrails')
    .select('*')
    .order('id');

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json(data.map(toGuardrail));
}
