import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { toActivityEvent } from '@/lib/transforms';

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data.map(toActivityEvent));
}
