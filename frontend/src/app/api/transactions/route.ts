import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', session.userId)
    .order('timestamp', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data.map(toTransaction));
}
