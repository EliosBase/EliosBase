import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toTransaction } from '@/lib/transforms';
import { logAudit, logActivity, txTypeToAuditAction, generateId } from '@/lib/audit';
import { publicClient } from '@/lib/viemClient';
import { insertTransactionRecord, updateTransactionRecord } from '@/lib/transactions';
import { verifyOnchainTransaction } from '@/lib/transactionVerification';

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

  if (session.walletAddress && String(body.from).toLowerCase() !== session.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Transaction sender does not match your wallet' }, { status: 400 });
  }

  // Verify the transaction on-chain
  let txStatus: 'confirmed' | 'pending' = 'pending';
  let blockNumber: number | null = null;

  try {
    ({ txStatus, blockNumber } = await verifyOnchainTransaction(body.txHash as `0x${string}`, {
      expectedFrom: session.walletAddress,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Transaction ')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }

  const supabase = createServiceClient();
  const id = generateId('tx');
  const { data, error } = await insertTransactionRecord(supabase, {
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
  });

  if (error || !data) {
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
        await updateTransactionRecord(supabase, tx.id, {
          status: 'confirmed',
          block_number: Number(receipt.blockNumber),
        });
        confirmed++;
      } else {
        await updateTransactionRecord(supabase, tx.id, { status: 'failed' });
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
