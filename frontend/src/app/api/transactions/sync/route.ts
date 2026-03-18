import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';
import { logAudit, logActivity } from '@/lib/audit';

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

  // Audit + activity for escrow/payment events
  const actor = session.walletAddress ?? session.userId!;
  if (body.type === 'escrow_lock') {
    await logAudit({ action: 'ESCROW_LOCK', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'payment', message: `Escrow locked: ${body.amount} ${body.token}`, userId: session.userId });
  } else if (body.type === 'escrow_release') {
    await logAudit({ action: 'ESCROW_RELEASE', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'payment', message: `Escrow released: ${body.amount} ${body.token}`, userId: session.userId });
  } else {
    await logAudit({ action: 'ESCROW_LOCK', actor, target: id, result: 'ALLOW' });
    await logActivity({ type: 'payment', message: `Transaction synced: ${body.type} ${body.amount} ${body.token}`, userId: session.userId });
  }

  return NextResponse.json(toTransaction(data), { status: 201 });
}
