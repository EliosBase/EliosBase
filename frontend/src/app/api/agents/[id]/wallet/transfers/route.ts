import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { createSecurityAlert, generateId, logActivity, logAudit } from '@/lib/audit';
import { evaluateAgentWalletTransfer, resolveAgentWallet } from '@/lib/agentWallets';
import { toAgentWalletTransfer } from '@/lib/transforms';
import { validateOrigin } from '@/lib/csrf';

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('owner_id')
    .eq('id', id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId && !['operator', 'admin'].includes(session.role ?? 'submitter')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: transfers, error } = await supabase
    .from('agent_wallet_transfers')
    .select('*')
    .eq('agent_id', id)
    .order('created_at', { ascending: false });

  if (error || !transfers) {
    return NextResponse.json({ error: 'Failed to load agent wallet transfers' }, { status: 500 });
  }

  return NextResponse.json(transfers.map(toAgentWalletTransfer));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const destination = String(body.destination ?? '').trim();
  const amountEth = String(body.amountEth ?? '').trim();
  const note = String(body.note ?? '').trim();

  if (!destination) {
    return NextResponse.json({ error: 'Destination is required' }, { status: 400 });
  }
  if (!amountEth || parseAmount(amountEth) === null) {
    return NextResponse.json({ error: 'Amount must be a positive ETH value' }, { status: 400 });
  }
  if (note.length < 8 || note.length > 240) {
    return NextResponse.json({ error: 'Add a note between 8 and 240 characters' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can initiate Safe transfers' }, { status: 403 });
  }

  const wallet = await resolveAgentWallet(agent);
  if (!wallet) {
    return NextResponse.json({ error: 'Agent wallet is not configured' }, { status: 400 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentTransfers } = await supabase
    .from('agent_wallet_transfers')
    .select('amount_eth')
    .eq('agent_id', id)
    .gte('created_at', since)
    .in('status', ['approved', 'executed']);

  const spentTodayEth = (recentTransfers ?? [])
    .reduce((sum, transfer) => sum + parseAmount(String(transfer.amount_eth ?? '0'))!, 0)
    .toFixed(6);

  const decision = await evaluateAgentWalletTransfer({
    safeAddress: wallet.address,
    destination,
    amountEth,
    policy: wallet.policy,
    spentTodayEth,
  });

  const transferId = generateId('awt');
  const payload = {
    id: transferId,
    agent_id: id,
    safe_address: wallet.address,
    destination,
    amount_eth: amountEth,
    note,
    status: decision.status,
    policy_reason: decision.policyReason,
    approvals_required: decision.approvalsRequired,
    approvals_received: decision.approvalsReceived,
    unlock_at: decision.unlockAt,
  };

  const { data: transfer, error: transferError } = await supabase
    .from('agent_wallet_transfers')
    .insert(payload)
    .select()
    .single();

  if (transferError || !transfer) {
    return NextResponse.json({ error: 'Failed to create the agent wallet transfer request' }, { status: 500 });
  }

  const actor = session.walletAddress ?? session.userId;
  await logAudit({
    action: 'AGENT_WALLET_TRANSFER',
    actor,
    target: `${id}:${transferId}`,
    result: decision.status === 'blocked' ? 'DENY' : 'ALLOW',
  });
  await logActivity({
    type: decision.status === 'blocked' ? 'security' : 'payment',
    message: decision.status === 'blocked'
      ? `Agent Safe transfer blocked for ${agent.name}: ${decision.policyReason}`
      : `Agent Safe transfer requested for ${agent.name}: ${amountEth} ETH`,
    userId: session.userId,
  });

  if (decision.status === 'blocked') {
    await createSecurityAlert({
      severity: 'high',
      title: 'Agent Safe transfer blocked',
      description: `${agent.name}: ${decision.policyReason}`,
      source: 'Agent Safe Policy',
      actor,
    });
  }

  return NextResponse.json(toAgentWalletTransfer(transfer), {
    status: decision.status === 'blocked' ? 409 : decision.status === 'queued' ? 202 : 201,
  });
}
