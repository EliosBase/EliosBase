import { NextRequest, NextResponse } from 'next/server';
import { formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createSecurityAlert } from '@/lib/audit';
import { readEnv, readFloatEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/server';
import { dedupeSignerBalanceAlerts, isSignerBalanceAlert } from '@/lib/productionData';
import { publicClient } from '@/lib/viemClient';
import { getConfiguredCronSecret, isProductionRuntime } from '@/lib/runtimeConfig';
import { timingSafeCompare } from '@/lib/authUtils';

// GET /api/cron/check-signer-balance — monitor proof submitter signer balance
export async function GET(req: NextRequest) {
  const cronSecret = getConfiguredCronSecret();
  if (!cronSecret && isProductionRuntime()) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const privateKey = readEnv(process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY)
    ?? readEnv(process.env.PROOF_SUBMITTER_PRIVATE_KEY);
  if (!privateKey) {
    return NextResponse.json({ error: 'SAFE_POLICY_SIGNER_PRIVATE_KEY or PROOF_SUBMITTER_PRIVATE_KEY not configured' }, { status: 500 });
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceEth = parseFloat(formatEther(balance));
  const threshold = readFloatEnv(process.env.SIGNER_MIN_BALANCE_ETH, 0.01);
  const belowThreshold = balanceEth < threshold;
  const supabase = createServiceClient();
  const { data: existingAlerts } = await supabase
    .from('security_alerts')
    .select('id, title, source, resolved')
    .order('timestamp', { ascending: false })
    .limit(20);

  const activeSignerAlert = dedupeSignerBalanceAlerts(existingAlerts ?? [])
    .find((row) => isSignerBalanceAlert(row) && !row.resolved);

  if (belowThreshold) {
    if (!activeSignerAlert) {
      await createSecurityAlert({
        severity: 'critical',
        title: 'Proof signer balance low',
        description: `Signer ${account.address} has ${balanceEth.toFixed(6)} ETH, below threshold of ${threshold} ETH. Proof submissions may fail.`,
        source: 'Signer Balance Monitor',
      });
    }
  } else if (activeSignerAlert) {
    await supabase
      .from('security_alerts')
      .update({ resolved: true })
      .eq('id', activeSignerAlert.id);
  }

  return NextResponse.json({
    address: account.address,
    balanceEth: balanceEth.toFixed(6),
    threshold,
    belowThreshold,
  });
}
