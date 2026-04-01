import { NextRequest, NextResponse } from 'next/server';
import { createUserServerClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

// Neynar webhook callback when a signer is approved
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const webhookSecret = process.env.NEYNAR_SIGNER_WEBHOOK_SECRET;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get('x-neynar-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      const expectedSig = createHmac('sha512', webhookSecret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSig) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const { data } = payload;

    if (!data?.signer_uuid || data?.status !== 'approved') {
      return NextResponse.json({ ok: true });
    }

    const supabase = createUserServerClient();
    await supabase
      .from('farcaster_signers')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('signer_uuid', data.signer_uuid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Signer webhook error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
