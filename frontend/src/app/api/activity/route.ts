import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { collapseNoisyActivity } from '@/lib/productionData';
import { toActivityEvent } from '@/lib/transforms';

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(collapseNoisyActivity(data).slice(0, 20).map(toActivityEvent));
}
