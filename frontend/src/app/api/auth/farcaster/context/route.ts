import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';

// Authenticate a Farcaster Mini App user via their FID and wallet address
// Called from the Mini App after getting context from the Farcaster SDK
export async function POST(req: NextRequest) {
  try {
    const { fid, username, walletAddress } = await req.json();

    if (!fid || !walletAddress) {
      return NextResponse.json({ error: 'fid and walletAddress are required' }, { status: 400 });
    }

    const supabase = createUserServerClient();
    const normalizedAddress = walletAddress.toLowerCase();

    // Look up user by FID first, then by wallet address
    let user: { id: string; wallet_address: string; role: string } | null = null;

    const { data: fidUser } = await supabase
      .from('users')
      .select('id, wallet_address, role')
      .eq('fid', fid)
      .single();

    if (fidUser) {
      user = fidUser;
    } else {
      const { data: walletUser } = await supabase
        .from('users')
        .select('id, wallet_address, role')
        .eq('wallet_address', normalizedAddress)
        .single();

      if (walletUser) {
        // Link FID to existing wallet user
        await supabase
          .from('users')
          .update({
            fid,
            fc_username: username || null,
            fc_linked_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', walletUser.id);
        user = walletUser;
      }
    }

    if (!user) {
      // Create new user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          wallet_address: normalizedAddress,
          fid,
          fc_username: username || null,
          fc_linked_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        .select('id, wallet_address, role')
        .single();

      if (error || !newUser) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
      }
      user = newUser;
    }

    // Set session
    const session = await getSession();
    session.userId = user.id;
    session.walletAddress = user.wallet_address;
    session.role = user.role as 'submitter' | 'operator' | 'admin';
    session.fid = fid;
    session.fcUsername = username || undefined;
    await session.save();

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      walletAddress: user.wallet_address,
      role: user.role,
      fid,
    });
  } catch (err) {
    console.error('Farcaster context auth error:', err);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
