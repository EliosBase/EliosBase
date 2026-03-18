import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';
import { logAudit, logActivity, txTypeToAuditAction, generateId } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  if (!body.type || !body.from || !body.to || !body.amount || !body.token || !body.txHash) {
    return NextResponse.json(
      { error: 'Missing required fields: type, from, to, amount, token, txHash' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const id = generateId('tx');
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
    return NextResponse.json({ error: 'Failed to sync transaction' }, { status: 500 });
  }

  const actor = session.walletAddress ?? session.userId!;
  await logAudit({ action: txTypeToAuditAction(body.type), actor, target: id, result: 'ALLOW' });
  await logActivity({ type: 'payment', message: `Transaction synced: ${body.type} ${body.amount} ${body.token}`, userId: session.userId });

  return NextResponse.json(toTransaction(data), { status: 201 });
}
