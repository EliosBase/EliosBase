import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deliverAlert, isAlertDeliveryConfigured } from '@/lib/alertDelivery';
import { getConfiguredCronSecret, isProductionRuntime } from '@/lib/runtimeConfig';

/**
 * GET /api/cron/alert-check
 * Checks for undelivered security alerts and dispatches them via webhook.
 * Should be called by Vercel cron every 5 minutes.
 */
export async function GET(req: NextRequest) {
  const cronSecret = getConfiguredCronSecret();
  if (!cronSecret && isProductionRuntime()) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isAlertDeliveryConfigured()) {
    return NextResponse.json({ message: 'No webhook configured, skipping' });
  }

  const supabase = createServiceClient();

  // Fetch unresolved high/critical alerts from the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: alerts, error } = await supabase
    .from('security_alerts')
    .select('*')
    .eq('resolved', false)
    .in('severity', ['critical', 'high'])
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[alert-check] Failed to fetch alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }

  let delivered = 0;
  for (const alert of alerts ?? []) {
    const success = await deliverAlert({
      id: alert.id,
      severity: alert.severity,
      title: alert.title ?? `Security Alert: ${alert.type}`,
      description: alert.description ?? alert.source ?? '',
      source: alert.source ?? 'unknown',
      timestamp: alert.created_at,
    });
    if (success) delivered++;
  }

  return NextResponse.json({
    checked: alerts?.length ?? 0,
    delivered,
    timestamp: new Date().toISOString(),
  });
}
