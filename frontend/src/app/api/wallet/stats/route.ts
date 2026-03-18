import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

// GET /api/wallet/stats — live wallet statistics for the authenticated user
export async function GET(_req: NextRequest) {
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

  // Calculate "In Escrow" — active escrow_lock minus released for this user
  const [locksRes, releasesRes, rewardsRes, stakesRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', session.userId)
      .eq('type', 'escrow_lock')
      .eq('status', 'confirmed'),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', session.userId)
      .eq('type', 'escrow_release')
      .eq('status', 'confirmed'),
    // Total Earned — reward transactions for this user
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', session.userId)
      .eq('type', 'reward')
      .eq('status', 'confirmed'),
    // Staked amount
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', session.userId)
      .eq('type', 'stake')
      .eq('status', 'confirmed'),
  ]);

  const parseAmounts = (rows: { amount: string }[] | null) =>
    (rows ?? []).reduce(
      (sum, row) => sum + parseFloat(row.amount.replace(/[^0-9.]/g, '') || '0'),
      0
    );

  const lockedTotal = parseAmounts(locksRes.data);
  const releasedTotal = parseAmounts(releasesRes.data);
  const inEscrow = Math.max(0, lockedTotal - releasedTotal);

  const totalEarned = parseAmounts(rewardsRes.data);
  const staked = parseAmounts(stakesRes.data);

  // Count active escrow locks for trend
  const { count: activeLocks } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.userId)
    .eq('type', 'escrow_lock')
    .eq('status', 'confirmed');

  return NextResponse.json({
    balance: `${ethBalance} ETH`,
    balanceTrend: '',
    inEscrow: `${inEscrow.toFixed(2)} ETH`,
    inEscrowTrend: `${activeLocks ?? 0} active locks`,
    totalEarned: `${totalEarned.toFixed(1)} ELIO`,
    totalEarnedTrend: '',
    staked: `${staked.toFixed(0)} ELIO`,
    stakedTrend: staked > 0 ? 'Earning 8.2% APY' : 'Not staking',
  });
}
