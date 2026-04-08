import { NextRequest } from 'next/server';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';
import { getPublicActivityFeed } from '@/lib/web4Graph';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20;
  const result = await getPublicActivityFeed({
    limit,
    cursor: searchParams.get('cursor'),
    entityType: searchParams.get('entityType') as Parameters<typeof getPublicActivityFeed>[0]['entityType'],
    entityId: searchParams.get('entityId'),
    eventType: searchParams.get('eventType'),
  });

  const response = jsonWithCache(result.items, PUBLIC_COLLECTION_CACHE_CONTROL);
  if (result.nextCursor) {
    response.headers.set('X-Activity-Next-Cursor', result.nextCursor);
  }

  return response;
}
