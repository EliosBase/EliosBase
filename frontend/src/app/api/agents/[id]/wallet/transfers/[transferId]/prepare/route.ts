import { NextRequest, NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { prepareAgentWalletTransferExecution, resolveAgentWallet } from '@/lib/agentWallets';
import { safeWalletChain } from '@/lib/agentWallet7579';
import { validateOrigin } from '@/lib/csrf';
import {
  getAgentWalletModules,
  getAgentWalletSession,
  inferTransferExecutionMode,
  isMigratedSafe7579,
} from '@/lib/agentWalletCompat';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; transferId: string }> },
) {
  const csrfError = validateOrigin(req);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, transferId } = await params;
  const supabase = createServiceClient();
  const { data: transfer, error: transferError } = await supabase
    .from('agent_wallet_transfers')
    .select('*')
    .eq('id', transferId)
    .eq('agent_id', id)
    .single();

  if (transferError || !transfer) {
    return NextResponse.json({ error: 'Agent wallet transfer not found' }, { status: 404 });
  }

  if (transfer.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved agent wallet transfers can be prepared' }, { status: 400 });
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, owner_id, wallet_address, wallet_policy, wallet_status, users:owner_id(wallet_address)')
    .eq('id', id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== session.userId) {
    return NextResponse.json({ error: 'Only the agent owner can prepare Safe execution' }, { status: 403 });
  }

  const wallet = await resolveAgentWallet(agent);
  if (!wallet || !isAddress(transfer.destination)) {
    return NextResponse.json({ error: 'Agent wallet is not ready for execution' }, { status: 400 });
  }

  if (getAddress(transfer.safe_address) !== wallet.address) {
    return NextResponse.json({ error: 'Approved transfer wallet does not match the current agent Safe' }, { status: 409 });
  }

  const executionMode = inferTransferExecutionMode(transfer, agent);
  if (executionMode === 'session') {
    const modules = getAgentWalletModules(agent);
    const sessionState = getAgentWalletSession(agent);
    if (!isMigratedSafe7579(agent)) {
      return NextResponse.json({ error: 'This transfer expects a migrated Safe7579 wallet' }, { status: 409 });
    }
    if (!modules?.sessionSalt || !sessionState?.address || !sessionState.validUntil) {
      return NextResponse.json({ error: 'Safe7579 session metadata is incomplete' }, { status: 409 });
    }

    return NextResponse.json({
      executionMode: 'session',
      safeAddress: wallet.address,
      chainId: safeWalletChain.id,
    });
  }

  const prepared = await prepareAgentWalletTransferExecution({
    safeAddress: wallet.address,
    destination: getAddress(transfer.destination),
    amountEth: transfer.amount_eth,
  });

  return NextResponse.json({
    executionMode,
    ...prepared,
  });
}
