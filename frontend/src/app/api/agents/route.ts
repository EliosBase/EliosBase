import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { toAgent } from '@/lib/transforms';

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = req.nextUrl;

  let query = supabase.from('agents').select('*');

  const type = searchParams.get('type');
  if (type) query = query.eq('type', type);

  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);

  const search = searchParams.get('search');
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query.order('reputation', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data.map(toAgent));
}
