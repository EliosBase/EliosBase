import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { toAgent } from '@/lib/transforms';
import { logAudit, logActivity, generateId } from '@/lib/audit';

const VALID_TYPES = ['sentinel', 'analyst', 'executor', 'auditor', 'optimizer'];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Input validation
  if (!body.name || typeof body.name !== 'string' || body.name.length > 100) {
    return NextResponse.json({ error: 'Name is required (max 100 chars)' }, { status: 400 });
  }
  if (!body.description || typeof body.description !== 'string' || body.description.length > 500) {
    return NextResponse.json({ error: 'Description is required (max 500 chars)' }, { status: 400 });
  }
  if (body.type && !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }
  if (body.capabilities && (!Array.isArray(body.capabilities) || body.capabilities.length > 10)) {
    return NextResponse.json({ error: 'Capabilities must be an array (max 10)' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const id = generateId('ag');
  const { data, error } = await supabase
    .from('agents')
    .insert({
      id,
      name: body.name.trim(),
      description: body.description.trim(),
      capabilities: (body.capabilities || []).map((c: string) => String(c).trim().slice(0, 50)),
      price_per_task: body.pricePerTask || '0.01 ETH',
      type: body.type || 'executor',
      status: 'offline',
      owner_id: session.userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to register agent' }, { status: 500 });
  }

  await logAudit({
    action: 'AGENT_REGISTER',
    actor: session.walletAddress ?? session.userId!,
    target: id,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'agent',
    message: `New agent registered: ${body.name}`,
    userId: session.userId,
  });

  return NextResponse.json(toAgent(data), { status: 201 });
}
