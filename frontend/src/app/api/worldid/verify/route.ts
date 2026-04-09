import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createUserServerClient } from '@/lib/supabase/server';

const WORLDID_APP_ID = process.env.NEXT_PUBLIC_WORLDID_APP_ID || '';
const WORLDID_ACTION = 'verify-agent-human';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { proof, merkle_root, nullifier_hash, verification_level, agentId } = await req.json();

    if (!proof || !merkle_root || !nullifier_hash || !agentId) {
      return NextResponse.json({ error: 'Missing proof parameters' }, { status: 400 });
    }

    // Verify with World ID cloud API
    const verifyRes = await fetch(
      `https://developer.worldcoin.org/api/v2/verify/${WORLDID_APP_ID}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merkle_root,
          nullifier_hash,
          proof,
          verification_level: verification_level || 'orb',
          action: WORLDID_ACTION,
        }),
      },
    );

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      console.error('World ID verification failed:', err);
      return NextResponse.json(
        { error: 'World ID verification failed' },
        { status: 400 },
      );
    }

    // Update agent record
    const supabase = createUserServerClient();

    // Verify the agent belongs to this user
    const { data: agent } = await supabase
      .from('agents')
      .select('id, owner_id')
      .eq('id', agentId)
      .single();

    if (!agent || agent.owner_id !== session.userId) {
      return NextResponse.json({ error: 'Agent not found or not owned by you' }, { status: 403 });
    }

    await supabase
      .from('agents')
      .update({ worldid_verified: true })
      .eq('id', agentId);

    return NextResponse.json({ verified: true });
  } catch (err) {
    console.error('World ID verify error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
