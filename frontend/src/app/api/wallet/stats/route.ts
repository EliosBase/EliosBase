import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { normalizeTransactionType } from '@/lib/transactions';

// GET /api/wallet/stats — live wallet statistics for the authenticated user
export async function GET() {
  const session = await getSession();
  if (!session.userId || !session.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const walletAddress = session.walletAddress as `0x${string}`;

  // Fetch on-chain ETH balance from Base network
  let ethBalance = '0';
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(),
    });
    const balanceWei = await client.getBalance({ address: walletAddress });
    ethBalance = parseFloat(formatEther(balanceWei)).toFixed(4);
  } catch {
    // If RPC fails, fall back to 0
    ethBalance = '0';
  }

  const { data: transactions } = await supabase
    .from('transactions')
    .select('type, from, to, amount, status')
    .eq('user_id', session.userId);

  const parseAmounts = (rows: { amount: string }[] | null) =>
    (rows ?? []).reduce(
      (sum, row) => sum + parseFloat(row.amount.replace(/[^0-9.]/g, '') || '0'),
      0
    );

  const confirmedTransactions = (transactions ?? []).filter((row) => row.status === 'confirmed');
  const lockedTotal = parseAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_lock'),
  );
  const releasedTotal = parseAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_release'),
  );
  const refundedTotal = parseAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_refund'),
  );
  const inEscrow = Math.max(0, lockedTotal - releasedTotal - refundedTotal);

  const totalEarned = parseAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'reward'),
  );
  const staked = parseAmounts(
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'stake'),
  );

  const activeLocks = Math.max(
    0,
    confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_lock').length
      - confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_release').length
      - confirmedTransactions.filter((row) => normalizeTransactionType(row) === 'escrow_refund').length,
  );

  return NextResponse.json({
    balance: `${ethBalance} ETH`,
    balanceTrend: '',
    inEscrow: `${inEscrow.toFixed(2)} ETH`,
    inEscrowTrend: `${activeLocks} active locks`,
    totalEarned: `${totalEarned.toFixed(1)} ELIO`,
    totalEarnedTrend: '',
    staked: `${staked.toFixed(0)} ELIO`,
    stakedTrend: staked > 0 ? 'Earning 8.2% APY' : 'Not staking',
  });
}
