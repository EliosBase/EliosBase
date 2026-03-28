import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { createSecurityAlert } from '@/lib/audit';
import { readEnv, readFloatEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/server';
import { dedupeSignerBalanceAlerts, isSignerBalanceAlert } from '@/lib/productionData';

const isTestnet = readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet';
const chain = isTestnet ? baseSepolia : base;
const rpcUrl = readEnv(process.env.BASE_RPC_URL) || (isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org');

// GET /api/cron/check-signer-balance — monitor proof submitter signer balance
export async function GET(req: NextRequest) {
  const cronSecret = readEnv(process.env.CRON_SECRET);
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const privateKey = readEnv(process.env.PROOF_SUBMITTER_PRIVATE_KEY);
  if (!privateKey) {
    return NextResponse.json({ error: 'PROOF_SUBMITTER_PRIVATE_KEY not configured' }, { status: 500 });
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const balance = await client.getBalance({ address: account.address });
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
