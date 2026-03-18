import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toAgent } from '@/lib/transforms';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();

  const id = `ag-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from('agents')
    .insert({
      id,
      name: body.name,
      description: body.description,
      capabilities: body.capabilities || [],
      price_per_task: body.pricePerTask || '0.01 ETH',
      type: body.type || 'executor',
      status: 'offline',
      owner_id: session.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(toAgent(data), { status: 201 });
}
