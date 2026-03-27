import { NextRequest, NextResponse } from 'next/server';
import { SiweMessage } from 'siwe';
import { readIntEnv } from '@/lib/env';
import { getSession } from '@/lib/session';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();
    const session = await getSession();

    const siweMessage = new SiweMessage(message);
    const { data: fields } = await siweMessage.verify({ signature });

    if (fields.nonce !== session.nonce) {
      return NextResponse.json({ error: 'Invalid nonce' }, { status: 422 });
    }

    const expectedChainId = readIntEnv(process.env.NEXT_PUBLIC_BASE_CHAIN_ID, 8453);
    if (fields.chainId !== expectedChainId) {
      return NextResponse.json({ error: 'Wrong chain. Please switch to Base network.' }, { status: 422 });
    }

    const supabase = createServiceClient();
    const walletAddress = fields.address.toLowerCase();

    const { data: user, error } = await supabase
      .from('users')
      .upsert(
        { wallet_address: walletAddress, last_seen_at: new Date().toISOString() },
        { onConflict: 'wallet_address' }
      )
      .select('id, wallet_address, role')
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Failed to upsert user' }, { status: 500 });
    }

    session.userId = user.id;
    session.walletAddress = user.wallet_address;
    session.chainId = fields.chainId;
    session.role = user.role;
    session.nonce = undefined;
    await session.save();

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      walletAddress: user.wallet_address,
      role: user.role,
    });
  } catch (err) {
    console.error('SIWE verify error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
