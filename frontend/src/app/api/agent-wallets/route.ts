import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { resolveAgentWallet } from '@/lib/agentWallets';
import { toAgent, toAgentWalletTransfer } from '@/lib/transforms';

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const canReviewTransfers = ['operator', 'admin'].includes(session.role ?? 'submitter');
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('*, users:owner_id(wallet_address)')
    .eq('owner_id', session.userId)
    .order('created_at', { ascending: false });

  if (agentsError || !agents) {
    return NextResponse.json({ error: 'Failed to load agent wallets' }, { status: 500 });
  }

  const hydratedAgents = await Promise.all(agents.map(async (agent) => {
    const wallet = await resolveAgentWallet({
      id: agent.id,
      wallet_address: agent.wallet_address,
      wallet_policy: agent.wallet_policy,
      wallet_status: agent.wallet_status,
      users: agent.users,
    });

    if (!wallet) {
      return toAgent(agent);
    }

    return toAgent({
      ...agent,
      wallet_address: wallet.address,
      wallet_kind: 'safe',
      wallet_status: wallet.status,
      wallet_policy: wallet.policy,
    });
  }));

  const agentIds = agents.map((agent) => agent.id);
  if (agentIds.length === 0) {
    if (!canReviewTransfers) {
      return NextResponse.json({ agents: hydratedAgents, transfers: [], reviewQueue: [] });
    }
  }

  const ownedTransfersPromise = agentIds.length === 0
    ? Promise.resolve({ data: [], error: null })
    : supabase
      .from('agent_wallet_transfers')
      .select('*, agents(name)')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(25);

  const reviewQueuePromise = !canReviewTransfers
    ? Promise.resolve({ data: [], error: null })
    : supabase
      .from('agent_wallet_transfers')
      .select('*, agents(name)')
      .in('status', ['queued', 'approved'])
      .order('created_at', { ascending: false })
      .limit(25);

  const [{ data: transfers, error: transfersError }, { data: reviewQueue, error: reviewQueueError }] = await Promise.all([
    ownedTransfersPromise,
    reviewQueuePromise,
  ]);

  if (transfersError || !transfers) {
    return NextResponse.json({ error: 'Failed to load agent wallet transfers' }, { status: 500 });
  }

  if (reviewQueueError || !reviewQueue) {
    return NextResponse.json({ error: 'Failed to load the Safe review queue' }, { status: 500 });
  }

  return NextResponse.json({
    agents: hydratedAgents,
    transfers: transfers.map(toAgentWalletTransfer),
    reviewQueue: reviewQueue.map(toAgentWalletTransfer),
  });
}
