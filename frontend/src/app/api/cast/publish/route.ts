import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';
import { publishCast } from '@/lib/neynar';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.castPublish);
  if (rateLimitError) return rateLimitError;

  const session = await getSession();
  if (!session.userId || !session.fid) {
    return NextResponse.json({ error: 'Not authenticated with Farcaster' }, { status: 401 });
  }

  const { text, embeds } = await req.json();

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  if (text.length > 320) {
    return NextResponse.json({ error: 'Cast text exceeds 320 character limit' }, { status: 400 });
  }

  // Get approved signer for this user
  const supabase = createUserServerClient();
  const { data: signer } = await supabase
    .from('farcaster_signers')
    .select('signer_uuid')
    .eq('user_id', session.userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!signer) {
    return NextResponse.json(
      { error: 'No approved Farcaster signer. Please approve a signer first.' },
      { status: 403 },
    );
  }

  try {
    const result = await publishCast(
      signer.signer_uuid,
      text,
      Array.isArray(embeds) ? embeds : undefined,
    );

    return NextResponse.json({
      castHash: result.castHash,
      warpcastUrl: result.warpcastUrl,
    });
  } catch (err) {
    console.error('Cast publish error:', err);
    return NextResponse.json({ error: 'Failed to publish cast' }, { status: 500 });
  }
}
