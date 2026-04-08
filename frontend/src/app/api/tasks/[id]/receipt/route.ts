import { NextRequest, NextResponse } from 'next/server';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';
import { getTaskReceipt } from '@/lib/web4Graph';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getTaskReceipt(id);

  if (!receipt) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return jsonWithCache(receipt, PUBLIC_COLLECTION_CACHE_CONTROL);
}
