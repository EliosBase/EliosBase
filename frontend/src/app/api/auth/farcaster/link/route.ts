import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { getConfiguredSiteUrl } from '@/lib/runtimeConfig';

async function getAppClient() {
  const { createAppClient, viemConnector } = await import('@farcaster/auth-kit');
  return createAppClient({ ethereum: viemConnector() });
}

export async function POST(req: NextRequest) {
  try {
    const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.authVerify);
    if (rateLimitError) return rateLimitError;

    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!session.nonce) {
      return NextResponse.json({ error: 'No nonce in session. Request a nonce first.' }, { status: 422 });
    }

    const { message, signature, fid, username, pfpUrl } = await req.json();

    const siteUrl = getConfiguredSiteUrl();
    const domain = siteUrl ? new URL(siteUrl).host : 'localhost:3000';

    const appClient = await getAppClient();
    const result = await appClient.verifySignInMessage({
      message,
      signature,
      domain,
      nonce: session.nonce,
    });

    if (!result.success) {
      return NextResponse.json({ error: 'Farcaster sign-in verification failed' }, { status: 401 });
    }

    const supabase = createUserServerClient();

    // Check FID isn't already linked to another user
    const { data: existingFidUser } = await supabase
      .from('users')
      .select('id')
      .eq('fid', fid)
      .single();

    if (existingFidUser && existingFidUser.id !== session.userId) {
      return NextResponse.json(
        { error: 'This Farcaster account is already linked to another user' },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('users')
      .update({
        fid,
        fc_username: username || null,
        fc_pfp_url: pfpUrl || null,
        fc_linked_at: now,
      })
      .eq('id', session.userId);

    if (error) {
      return NextResponse.json({ error: 'Failed to link Farcaster account' }, { status: 500 });
    }

    session.fid = fid;
    session.fcUsername = username || undefined;
    session.nonce = undefined;
    await session.save();

    return NextResponse.json({ linked: true, fid, fcUsername: username });
  } catch (err) {
    console.error('Farcaster link error:', err);
    return NextResponse.json({ error: 'Linking failed' }, { status: 400 });
  }
}
