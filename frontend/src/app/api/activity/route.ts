import { NextRequest, NextResponse } from 'next/server';
import { createPublicServerClient } from '@/lib/supabase/server';
import { collapseNoisyActivity } from '@/lib/productionData';
import { toActivityEvent } from '@/lib/transforms';
import { parsePagination } from '@/lib/pagination';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';

export async function GET(req: NextRequest) {
  const supabase = createPublicServerClient();
  const { limit, offset } = parsePagination(req.nextUrl.searchParams);
  const fetchLimit = Math.min(100, Math.max(limit * 3, offset + limit));

  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(fetchLimit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activity = collapseNoisyActivity(data)
    .slice(offset, offset + limit)
    .map(toActivityEvent);

  return jsonWithCache(activity, PUBLIC_COLLECTION_CACHE_CONTROL);
}
