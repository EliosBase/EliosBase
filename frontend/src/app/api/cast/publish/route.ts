import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';
import { publishCast } from '@/lib/neynar';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { validateOrigin } from '@/lib/csrf';
import { publishCastSchema } from '@/lib/schemas/cast';

export async function POST(req: NextRequest) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.castPublish);
  if (rateLimitError) return rateLimitError;

  const session = await getSession();
  if (!session.userId || !session.fid) {
    return NextResponse.json({ error: 'Not authenticated with Farcaster' }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = publishCastSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }
  const { text, embeds } = parsed.data;

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
