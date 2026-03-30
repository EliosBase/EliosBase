import { NextRequest, NextResponse } from 'next/server';
import { createUserServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';
import { parsePagination } from '@/lib/pagination';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { limit, offset } = parsePagination(req.nextUrl.searchParams);
  const supabase = createUserServerClient();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', session.userId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data.map(toTransaction));
}
