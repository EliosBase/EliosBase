import { NextRequest, NextResponse } from 'next/server';
import { createPublicServerClient } from '@/lib/supabase/server';
import { toAgent } from '@/lib/transforms';
import { parsePagination } from '@/lib/pagination';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';

export async function GET(req: NextRequest) {
  const supabase = createPublicServerClient();
  const { searchParams } = req.nextUrl;
  const { limit, offset } = parsePagination(searchParams);

  let query = supabase.from('agents').select('*');

  const type = searchParams.get('type');
  if (type) query = query.eq('type', type);

  const status = searchParams.get('status');
  if (status) {
    query = query.eq('status', status);
  } else {
    // Hide suspended agents from the public marketplace by default.
    // Admins can still query them explicitly via ?status=suspended.
    query = query.neq('status', 'suspended');
  }

  const search = searchParams.get('search');
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query
    .order('reputation', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return jsonWithCache(data.map(toAgent), PUBLIC_COLLECTION_CACHE_CONTROL);
}
