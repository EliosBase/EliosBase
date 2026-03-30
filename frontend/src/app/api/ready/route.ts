import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { publicClient } from '@/lib/viemClient';
import { getRuntimeConfigurationStatus } from '@/lib/runtimeConfig';

export async function GET() {
  const config = getRuntimeConfigurationStatus();
  const checks = [...config.checks];

  if (!config.configured) {
    return NextResponse.json(
      {
        ok: false,
        status: 'not-ready',
        checks,
        missing: config.missing,
      },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const [dbResult, rpcResult] = await Promise.allSettled([
    supabase.from('agents').select('id', { count: 'exact', head: true }),
    publicClient.getBlockNumber(),
  ]);

  checks.push({
    name: 'SUPABASE_CONNECTIVITY',
    configured: dbResult.status === 'fulfilled' && !dbResult.value.error,
  });
  checks.push({
    name: 'BASE_RPC_CONNECTIVITY',
    configured: rpcResult.status === 'fulfilled',
  });

  const missing = checks.filter((check) => !check.configured).map((check) => check.name);
  const ok = missing.length === 0;

  return NextResponse.json(
    {
      ok,
      status: ok ? 'ready' : 'not-ready',
      checks,
      missing,
    },
    { status: ok ? 200 : 503 },
  );
}
