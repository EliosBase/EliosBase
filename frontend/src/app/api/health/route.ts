import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { publicClient } from '@/lib/viemClient';
import { readEnv, readFloatEnv } from '@/lib/env';
import { isAlertDeliveryConfigured } from '@/lib/alertDelivery';
import { formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail?: string;
}

/**
 * GET /api/health
 * Deep operational health check. Validates all critical dependencies:
 * - Supabase DB connectivity
 * - Base RPC reachability
 * - Proof signer balance
 * - Anthropic API key presence
 * - Redis / rate limiting configuration
 * - Alert webhook configuration
 */
export async function GET() {
  const checks: HealthCheck[] = [];
  const start = Date.now();

  // 1. Database
  const supabase = createServiceClient();
  try {
    const { error } = await supabase.from('agents').select('id', { count: 'exact', head: true });
    checks.push({ name: 'database', status: error ? 'fail' : 'ok', detail: error?.message });
  } catch (err) {
    checks.push({ name: 'database', status: 'fail', detail: String(err) });
  }

  // 2. Base RPC
  try {
    const blockNumber = await publicClient.getBlockNumber();
    checks.push({ name: 'base_rpc', status: 'ok', detail: `block ${blockNumber}` });
  } catch (err) {
    checks.push({ name: 'base_rpc', status: 'fail', detail: String(err) });
  }

  // 3. Proof signer balance
  const signerKey = readEnv(process.env.SAFE_POLICY_SIGNER_PRIVATE_KEY)
    ?? readEnv(process.env.PROOF_SUBMITTER_PRIVATE_KEY);
  if (signerKey) {
    try {
      const account = privateKeyToAccount(signerKey as `0x${string}`);
      const balance = await publicClient.getBalance({ address: account.address });
      const balanceEth = parseFloat(formatEther(balance));
      const threshold = readFloatEnv(process.env.SIGNER_MIN_BALANCE_ETH, 0.01);
      checks.push({
        name: 'signer_balance',
        status: balanceEth < threshold ? 'warn' : 'ok',
        detail: `${balanceEth.toFixed(6)} ETH (threshold: ${threshold})`,
      });
    } catch (err) {
      checks.push({ name: 'signer_balance', status: 'fail', detail: String(err) });
    }
  } else {
    checks.push({ name: 'signer_balance', status: 'warn', detail: 'No signer key configured' });
  }

  // 4. Anthropic API key
  const anthropicKey = readEnv(process.env.ANTHROPIC_API_KEY);
  checks.push({
    name: 'anthropic_api',
    status: anthropicKey ? 'ok' : 'warn',
    detail: anthropicKey ? 'configured' : 'ANTHROPIC_API_KEY not set',
  });

  // 5. Redis (Upstash)
  const redisUrl = readEnv(process.env.UPSTASH_REDIS_REST_URL);
  const redisToken = readEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  checks.push({
    name: 'redis',
    status: redisUrl && redisToken ? 'ok' : 'warn',
    detail: redisUrl && redisToken ? 'configured' : 'Rate limiting disabled',
  });

  // 6. Alert delivery
  checks.push({
    name: 'alert_webhook',
    status: isAlertDeliveryConfigured() ? 'ok' : 'warn',
    detail: isAlertDeliveryConfigured() ? 'configured' : 'ALERT_WEBHOOK_URL not set',
  });

  // 7. Open alerts count
  try {
    const { count } = await supabase
      .from('security_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', false)
      .in('severity', ['critical', 'high']);
    checks.push({
      name: 'open_alerts',
      status: (count ?? 0) > 0 ? 'warn' : 'ok',
      detail: `${count ?? 0} unresolved critical/high alerts`,
    });
  } catch {
    checks.push({ name: 'open_alerts', status: 'fail', detail: 'Could not check alerts' });
  }

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');

  return NextResponse.json(
    {
      ok: !hasFail,
      status: hasFail ? 'unhealthy' : 'live',
      checks,
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    },
    { status: hasFail ? 503 : 200 },
  );
}
