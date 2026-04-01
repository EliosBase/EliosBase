import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { getConfiguredSiteUrl, isProductionRuntime } from '@/lib/runtimeConfig';

async function getAppClient() {
  const { createAppClient, viemConnector } = await import('@farcaster/auth-kit');
  return createAppClient({ ethereum: viemConnector() });
}

export async function POST(req: NextRequest) {
  try {
    const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.authVerify);
    if (rateLimitError) return rateLimitError;

    const { message, signature, fid, username, pfpUrl } = await req.json();
    const session = await getSession();

    if (!session.nonce) {
      return NextResponse.json({ error: 'No nonce in session. Request a nonce first.' }, { status: 422 });
    }

    const siteUrl = getConfiguredSiteUrl();
    if (!siteUrl && isProductionRuntime()) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SITE_URL not configured' }, { status: 500 });
    }

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

    const custodyAddress = result.fid ? (result.data?.address?.toLowerCase() ?? null) : null;

    const supabase = createUserServerClient();

    // Try to find existing user by FID first, then by custody address
    let user: { id: string; wallet_address: string; role: string } | null = null;

    if (fid) {
      const { data } = await supabase
        .from('users')
        .select('id, wallet_address, role')
        .eq('fid', fid)
        .single();
      user = data;
    }

    if (!user && custodyAddress) {
      const { data } = await supabase
        .from('users')
        .select('id, wallet_address, role')
        .eq('wallet_address', custodyAddress)
        .single();
      user = data;
    }

    const now = new Date().toISOString();

    if (user) {
      // Update existing user with Farcaster identity
      await supabase
        .from('users')
        .update({
          fid,
          fc_username: username || null,
          fc_pfp_url: pfpUrl || null,
          fc_linked_at: now,
          last_seen_at: now,
        })
        .eq('id', user.id);
    } else {
      // Create new user with Farcaster identity
      const walletAddress = custodyAddress || `fc:${fid}`;
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          wallet_address: walletAddress,
          fid,
          fc_username: username || null,
          fc_pfp_url: pfpUrl || null,
          fc_linked_at: now,
          last_seen_at: now,
        })
        .select('id, wallet_address, role')
        .single();

      if (error || !newUser) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
      }
      user = newUser;
    }

    session.userId = user.id;
    session.walletAddress = user.wallet_address;
    session.role = user.role as 'submitter' | 'operator' | 'admin';
    session.fid = fid;
    session.fcUsername = username || undefined;
    session.nonce = undefined;
    await session.save();

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      walletAddress: user.wallet_address,
      role: user.role,
      fid,
      fcUsername: username,
    });
  } catch (err) {
    console.error('Farcaster verify error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
