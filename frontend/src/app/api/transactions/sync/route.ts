import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();

  const id = `tx-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      id,
      type: body.type,
      from: body.from,
      to: body.to,
      amount: body.amount,
      token: body.token,
      status: body.status || 'pending',
      tx_hash: body.txHash,
      user_id: session.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(toTransaction(data), { status: 201 });
}
