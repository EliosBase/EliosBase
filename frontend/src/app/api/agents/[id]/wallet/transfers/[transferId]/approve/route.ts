import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdminOrOperator } from '@/lib/adminAuth';
import { logActivity, logAudit } from '@/lib/audit';
import { toAgentWalletTransfer } from '@/lib/transforms';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; transferId: string }> },
) {
  const auth = await requireAdminOrOperator(req);
  if (auth.error) return auth.error;

  const { id, transferId } = await params;
  const supabase = createServiceClient();
  const { data: transfer, error: transferError } = await supabase
    .from('agent_wallet_transfers')
    .select('*, agents(name)')
    .eq('id', transferId)
    .eq('agent_id', id)
    .single();

  if (transferError || !transfer) {
    return NextResponse.json({ error: 'Agent wallet transfer not found' }, { status: 404 });
  }

  if (transfer.status !== 'queued') {
    return NextResponse.json({ error: 'Only queued agent wallet transfers can be approved' }, { status: 400 });
  }

  if (transfer.unlock_at && new Date(transfer.unlock_at).getTime() > Date.now()) {
    return NextResponse.json({ error: 'Timelock has not expired yet' }, { status: 400 });
  }

  const { data: approved, error: updateError } = await supabase
    .from('agent_wallet_transfers')
    .update({
      status: 'approved',
      approvals_received: transfer.approvals_required,
      approved_at: new Date().toISOString(),
      approved_by: auth.session.userId,
    })
    .eq('id', transferId)
    .eq('agent_id', id)
    .select()
    .single();

  if (updateError || !approved) {
    return NextResponse.json({ error: 'Failed to approve the agent wallet transfer' }, { status: 500 });
  }

  const actor = auth.session.walletAddress ?? auth.session.userId;
  await logAudit({
    action: 'AGENT_WALLET_APPROVE',
    actor,
    target: `${id}:${transferId}`,
    result: 'ALLOW',
  });
  await logActivity({
    type: 'payment',
    message: `Agent Safe transfer approved for ${transfer.agents?.name ?? id}: ${transfer.amount_eth} ETH`,
    userId: auth.session.userId,
  });

  return NextResponse.json(toAgentWalletTransfer(approved));
}
