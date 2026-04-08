import { NextRequest, NextResponse } from 'next/server';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';
import { getAgentPassport } from '@/lib/web4Graph';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const passport = await getAgentPassport(id);

  if (!passport) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return jsonWithCache(passport, PUBLIC_COLLECTION_CACHE_CONTROL);
}
