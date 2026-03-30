import { NextResponse } from 'next/server';

export const PUBLIC_COLLECTION_CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=120';
export const PUBLIC_STATS_CACHE_CONTROL = 'public, s-maxage=15, stale-while-revalidate=60';

export function jsonWithCache<T>(body: T, cacheControl: string, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', cacheControl);
  return response;
}
