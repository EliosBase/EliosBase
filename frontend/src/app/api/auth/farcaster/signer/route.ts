import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';
import { createManagedSigner, checkSignerStatus } from '@/lib/neynar';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

// GET — check signer status for current user
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createUserServerClient();
  const { data: signer } = await supabase
    .from('farcaster_signers')
    .select('signer_uuid, public_key, status, approved_at')
    .eq('user_id', session.userId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!signer) {
    return NextResponse.json({ status: 'none' });
  }

  // If pending, check with Neynar for update
  if (signer.status === 'pending_approval') {
    try {
      const live = await checkSignerStatus(signer.signer_uuid);
      if (live.status === 'approved') {
        await supabase
          .from('farcaster_signers')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('signer_uuid', signer.signer_uuid);

        return NextResponse.json({
          status: 'approved',
          signerUuid: signer.signer_uuid,
        });
      }
    } catch {
      // Neynar unreachable — return cached status
    }
  }

  return NextResponse.json({
    status: signer.status,
    signerUuid: signer.status === 'approved' ? signer.signer_uuid : undefined,
  });
}

// POST — create a new managed signer
export async function POST(req: NextRequest) {
  const rateLimitError = await enforceRateLimit(req, RATE_LIMITS.signerCreate);
  if (rateLimitError) return rateLimitError;

  const session = await getSession();
  if (!session.userId || !session.fid) {
    return NextResponse.json(
      { error: 'Not authenticated with Farcaster' },
      { status: 401 },
    );
  }

  const supabase = createUserServerClient();

  // Check for existing non-revoked signer
  const { data: existing } = await supabase
    .from('farcaster_signers')
    .select('signer_uuid, status')
    .eq('user_id', session.userId)
    .neq('status', 'revoked')
    .limit(1)
    .single();

  if (existing?.status === 'approved') {
    return NextResponse.json({
      status: 'approved',
      signerUuid: existing.signer_uuid,
    });
  }

  try {
    const result = await createManagedSigner(session.fid);

    // Upsert signer record
    if (existing) {
      await supabase
        .from('farcaster_signers')
        .update({
          signer_uuid: result.signerUuid,
          public_key: result.publicKey,
          status: 'pending_approval',
        })
        .eq('user_id', session.userId)
        .eq('signer_uuid', existing.signer_uuid);
    } else {
      await supabase
        .from('farcaster_signers')
        .insert({
          user_id: session.userId,
          fid: session.fid,
          signer_uuid: result.signerUuid,
          public_key: result.publicKey,
          status: 'pending_approval',
        });
    }

    return NextResponse.json({
      status: 'pending_approval',
      signerUuid: result.signerUuid,
      signerApprovalUrl: result.signerApprovalUrl,
    });
  } catch (err) {
    console.error('Failed to create signer:', err);
    return NextResponse.json({ error: 'Failed to create signer' }, { status: 500 });
  }
}
