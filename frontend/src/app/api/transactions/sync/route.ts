import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';
import { logAudit, logActivity, txTypeToAuditAction, generateId } from '@/lib/audit';
import { publicClient } from '@/lib/viemClient';

// POST /api/transactions/sync — store a new transaction with on-chain verification
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

  // Verify the transaction on-chain
  let txStatus: 'confirmed' | 'pending' = 'pending';
  let blockNumber: number | null = null;

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: body.txHash as `0x${string}`,
    });
    if (receipt.status === 'success') {
      txStatus = 'confirmed';
      blockNumber = Number(receipt.blockNumber);
    } else if (receipt.status === 'reverted') {
      txStatus = 'pending'; // will be caught by batch sync later
    }
  } catch {
    // Receipt not yet available — store as pending
    txStatus = 'pending';
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
      status: body.status || txStatus,
      tx_hash: body.txHash,
      user_id: session.userId,
      block_number: blockNumber,
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

// GET /api/transactions/sync — batch-verify all pending transactions on-chain
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all pending transactions
  const { data: pending, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('status', 'pending')
    .order('timestamp', { ascending: true });

  if (fetchError || !pending) {
    return NextResponse.json({ error: 'Failed to fetch pending transactions' }, { status: 500 });
  }

  let confirmed = 0;
  let failed = 0;

  for (const tx of pending) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: tx.tx_hash as `0x${string}`,
      });

      if (receipt.status === 'success') {
        await supabase
          .from('transactions')
          .update({ status: 'confirmed', block_number: Number(receipt.blockNumber) })
          .eq('id', tx.id);
        confirmed++;
      } else {
        await supabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('id', tx.id);
        failed++;
      }
    } catch {
      // Receipt not available yet — leave as pending
    }
  }

  return NextResponse.json({
    synced: { confirmed, failed, stillPending: pending.length - confirmed - failed },
  });
}
