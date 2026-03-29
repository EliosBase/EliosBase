'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2, Shield, Users, WalletCards } from 'lucide-react';
import { getAddress } from 'viem';
import StatCard from '@/components/dashboard/StatCard';
import TransactionRow from '@/components/dashboard/TransactionRow';
import WalletTransferCard from '@/components/dashboard/WalletTransferCard';
import { useAgentWallets } from '@/hooks/useAgentWallets';
import { useTransactions } from '@/hooks/useTransactions';
import { useWalletStats } from '@/hooks/useWalletStats';
import { useAuthContext } from '@/providers/AuthProvider';
import type { AgentWalletTransfer } from '@/lib/types';

type PreparedExecution = {
  safeTxHash: string;
  txData: {
    to: string;
    value: string;
    data: string;
    operation: number;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
    nonce: number;
  };
  chainId: number;
  safeVersion: string;
};

const smartWalletFeatures = [
  {
    icon: WalletCards,
    name: 'Safe Smart Accounts',
    description: 'Every newly registered agent now gets a dedicated Safe payout wallet instead of settling straight to the operator EOA.',
    active: true,
  },
  {
    icon: Shield,
    name: 'Daily Spend Limits',
    description: 'Agent wallet transfer requests are blocked automatically once the configured daily ETH ceiling would be exceeded.',
    active: true,
  },
  {
    icon: Users,
    name: 'Co-Sign Review Lane',
    description: 'Large Safe transfers queue for operator approval and still require the Safe owner signature before execution.',
    active: true,
  },
  {
    icon: Clock,
    name: 'Time-Locked High Risk',
    description: 'High-value Safe transfers sit behind a timelock before they can move into the executable lane.',
    active: true,
  },
];

function formatTimestamp(value?: string) {
  return value ? new Date(value).toLocaleString() : null;
}

export default function WalletPage() {
  const queryClient = useQueryClient();
  const { isAuthenticated, session } = useAuthContext();
  const { data: transactions = [], isLoading } = useTransactions(isAuthenticated);
  const { data: stats } = useWalletStats(isAuthenticated);
  const { data: agentWalletData, isLoading: areAgentWalletsLoading } = useAgentWallets(isAuthenticated);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [destination, setDestination] = useState('');
  const [amountEth, setAmountEth] = useState('');
  const [note, setNote] = useState('');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const [queueError, setQueueError] = useState('');
  const [queueStatus, setQueueStatus] = useState('');
  const [approvingTransferId, setApprovingTransferId] = useState('');
  const [executingTransferId, setExecutingTransferId] = useState('');

  const ownedAgents = useMemo(
    () => agentWalletData?.agents ?? [],
    [agentWalletData?.agents],
  );
  const agentTransfers = useMemo(
    () => agentWalletData?.transfers ?? [],
    [agentWalletData?.transfers],
  );
  const reviewQueue = useMemo(
    () => agentWalletData?.reviewQueue ?? [],
    [agentWalletData?.reviewQueue],
  );
  const isReviewer = session?.role === 'operator' || session?.role === 'admin';

  useEffect(() => {
    if (!selectedAgentId && ownedAgents.length > 0) {
      setSelectedAgentId(ownedAgents[0].id);
    }
  }, [ownedAgents, selectedAgentId]);

  const selectedAgent = useMemo(
    () => ownedAgents.find((agent) => agent.id === selectedAgentId) ?? ownedAgents[0],
    [ownedAgents, selectedAgentId],
  );
  const visibleTransfers = useMemo(
    () => selectedAgent ? agentTransfers.filter((transfer) => transfer.agentId === selectedAgent.id) : agentTransfers,
    [agentTransfers, selectedAgent],
  );

  const walletStats = [
    {
      label: 'Balance',
      value: stats?.balance ?? '--',
      trend: stats?.balanceTrend ?? '',
      trendUp: true,
    },
    {
      label: 'In Escrow',
      value: stats?.inEscrow ?? '--',
      trend: stats?.inEscrowTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Total Earned',
      value: stats?.totalEarned ?? '--',
      trend: stats?.totalEarnedTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Staked',
      value: stats?.staked ?? '--',
      trend: stats?.stakedTrend ?? '',
      trendUp: true,
    },
  ];

  async function refreshWalletViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['agent-wallets'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['wallet-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
    ]);
  }

  async function handleSafeTransferSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) {
      setTransferError('Register an agent first.');
      return;
    }

    setIsSubmittingTransfer(true);
    setTransferError('');
    setTransferStatus('');
    setQueueError('');
    setQueueStatus('');

    try {
      const res = await fetch(`/api/agents/${selectedAgent.id}/wallet/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          amountEth,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setTransferError(data.error || 'Failed to create the Safe transfer request.');
        return;
      }

      if (data.status === 'queued') {
        setTransferStatus('Queued for operator approval and Safe owner execution.');
      } else if (data.status === 'blocked') {
        setTransferStatus('Blocked by the agent wallet policy.');
      } else {
        setTransferStatus('Auto-cleared by policy. Execute it from the queue with MetaMask.');
      }

      setDestination('');
      setAmountEth('');
      setNote('');
      await refreshWalletViews();
    } finally {
      setIsSubmittingTransfer(false);
    }
  }

  async function handleApproveTransfer(transfer: AgentWalletTransfer) {
    setQueueError('');
    setQueueStatus('');
    setApprovingTransferId(transfer.id);

    try {
      const res = await fetch(`/api/agents/${transfer.agentId}/wallet/transfers/${transfer.id}/approve`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setQueueError(data.error || 'Failed to approve the Safe transfer.');
        return;
      }

      setQueueStatus(`Approved ${transfer.amountEth} ETH for ${transfer.agentName ?? 'the agent Safe'}.`);
      await refreshWalletViews();
    } finally {
      setApprovingTransferId('');
    }
  }

  async function handleExecuteTransfer(transfer: AgentWalletTransfer) {
    setQueueError('');
    setQueueStatus('');

    if (!session?.walletAddress) {
      setQueueError('Sign in with the Safe owner wallet first.');
      return;
    }

    const injected = (window as Window & { ethereum?: unknown }).ethereum;
    if (!injected) {
      setQueueError('MetaMask is required to sign the Safe execution.');
      return;
    }

    setExecutingTransferId(transfer.id);

    try {
      const prepareRes = await fetch(`/api/agents/${transfer.agentId}/wallet/transfers/${transfer.id}/prepare`, {
        method: 'POST',
      });
      const prepared = await prepareRes.json().catch(() => ({} as PreparedExecution));
      if (!prepareRes.ok) {
        setQueueError((prepared as { error?: string }).error || 'Failed to prepare the Safe transaction.');
        return;
      }

      const { default: Safe } = await import('@safe-global/protocol-kit');
      const owner = getAddress(session.walletAddress);
      const safe = await Safe.init({
        provider: injected as never,
        signer: owner,
        safeAddress: transfer.safeAddress,
      });
      const safeTransaction = await safe.createTransaction({
        transactions: [{
          to: prepared.txData.to,
          value: prepared.txData.value,
          data: prepared.txData.data,
          operation: prepared.txData.operation,
        }],
        options: {
          nonce: prepared.txData.nonce,
          safeTxGas: prepared.txData.safeTxGas,
          baseGas: prepared.txData.baseGas,
          gasPrice: prepared.txData.gasPrice,
          gasToken: prepared.txData.gasToken,
          refundReceiver: prepared.txData.refundReceiver,
        },
      });
      const signed = await safe.signTransaction(safeTransaction);
      const ownerSignature = signed.getSignature(owner)?.data
        ?? signed.getSignature(owner.toLowerCase())?.data;

      if (!ownerSignature) {
        setQueueError('MetaMask signed the Safe transaction, but Elios could not read the owner signature.');
        return;
      }

      const executeRes = await fetch(`/api/agents/${transfer.agentId}/wallet/transfers/${transfer.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSignature,
          txData: safeTransaction.data,
        }),
      });
      const data = await executeRes.json().catch(() => ({}));

      if (!executeRes.ok) {
        setQueueError(data.error || 'Failed to execute the Safe transfer.');
        return;
      }

      setQueueStatus(`Executed ${transfer.amountEth} ETH from the agent Safe on Base.`);
      await refreshWalletViews();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute the Safe transfer.';
      setQueueError(message);
    } finally {
      setExecutingTransferId('');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">
          Connect your wallet and sign in to view transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {walletStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="space-y-6">
            <WalletTransferCard />

            <div className="glass p-5 rounded-2xl">
              <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-1">
                Agent Safe Controls
              </h2>
              <p className="text-[11px] text-white/30 mb-4 font-[family-name:var(--font-body)]">
                The Safe-backed payout and policy controls Elios enforces on agent wallets.
              </p>
              <div className="space-y-3">
                {smartWalletFeatures.map(({ icon: Icon, name, description, active }) => (
                  <div key={name} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/3">
                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={14} className="text-white/50" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white/80 font-[family-name:var(--font-body)]">{name}</p>
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-white/20'}`} />
                      </div>
                      <p className="text-[11px] text-white/35 mt-0.5">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass p-5 rounded-2xl">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide">
                    Owned Agent Safes
                  </h2>
                  <p className="text-[11px] text-white/30 mt-1">
                    Escrow releases for your agents settle to these Safe payout wallets.
                  </p>
                </div>
              </div>

              {areAgentWalletsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : ownedAgents.length === 0 ? (
                <p className="text-sm text-white/35">
                  Register an agent to provision its Safe wallet.
                </p>
              ) : (
                <div className="space-y-3">
                  {ownedAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        selectedAgent?.id === agent.id
                          ? 'border-white/30 bg-white/8'
                          : 'border-white/8 bg-white/3 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{agent.name}</p>
                          <p className="mt-1 text-[11px] text-white/35 font-[family-name:var(--font-mono)]">
                            {agent.walletAddress ?? 'Wallet pending'}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                          {agent.walletStatus ?? 'predicted'}
                        </span>
                      </div>
                      {agent.walletPolicy ? (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                          <p>Threshold: {agent.walletPolicy.threshold}-of-{agent.walletPolicy.owners.length}</p>
                          <p>Daily limit: {agent.walletPolicy.dailySpendLimitEth} ETH</p>
                          <p>Co-sign over: {agent.walletPolicy.coSignThresholdEth} ETH</p>
                          <p>Timelock over: {agent.walletPolicy.timelockThresholdEth} ETH</p>
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedAgent ? (
              <div className="glass p-5 rounded-2xl">
                <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-1">
                  Request Agent Safe Transfer
                </h2>
                <p className="text-[11px] text-white/30 mb-4">
                  Small transfers auto-clear into the executable lane. Large transfers queue behind review and timelock controls.
                </p>

                <form className="space-y-3" onSubmit={handleSafeTransferSubmit}>
                  <div>
                    <label className="block text-[11px] text-white/45 mb-1">Agent</label>
                    <select
                      value={selectedAgent?.id ?? ''}
                      onChange={(event) => setSelectedAgentId(event.target.value)}
                      className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-sm text-white"
                    >
                      {ownedAgents.map((agent) => (
                        <option key={agent.id} value={agent.id} className="bg-neutral-950">
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/45 mb-1">Destination</label>
                    <input
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                      placeholder="0x..."
                      className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/45 mb-1">Amount (ETH)</label>
                    <input
                      value={amountEth}
                      onChange={(event) => setAmountEth(event.target.value)}
                      placeholder="0.10"
                      className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/45 mb-1">Why this transfer is needed</label>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      placeholder="Explain the payout, vendor, or operational reason."
                      className="w-full rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/20 resize-none"
                    />
                  </div>
                  {transferError ? <p className="text-xs text-red-400">{transferError}</p> : null}
                  {transferStatus ? <p className="text-xs text-white/55">{transferStatus}</p> : null}
                  <button
                    type="submit"
                    disabled={isSubmittingTransfer}
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                  >
                    {isSubmittingTransfer ? 'Submitting…' : 'Queue Safe Transfer'}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-5 rounded-2xl">
            <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-4">
              Transaction History
            </h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-1">
                {transactions.length === 0 ? (
                  <p className="text-sm text-white/30 text-center py-6 font-[family-name:var(--font-body)]">
                    No transactions yet.
                  </p>
                ) : (
                  transactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))
                )}
              </div>
            )}
          </div>

          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-1">
                  Agent Safe Transfer Queue
                </h2>
                <p className="text-[11px] text-white/30">
                  Owners execute approved Safe transfers from MetaMask. Operators clear the review lane for queued items.
                </p>
              </div>
            </div>
            {queueError ? <p className="mt-4 text-xs text-red-400">{queueError}</p> : null}
            {queueStatus ? <p className="mt-4 text-xs text-white/55">{queueStatus}</p> : null}

            {visibleTransfers.length === 0 ? (
              <p className="mt-4 text-sm text-white/35">
                No agent Safe transfer requests yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {visibleTransfers.map((transfer) => {
                  const canExecute = transfer.status === 'approved' && !!session?.walletAddress;
                  const isExecuting = executingTransferId === transfer.id;

                  return (
                    <div key={transfer.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-white">{transfer.amountEth} ETH</p>
                          <p className="mt-1 text-[11px] text-white/35 font-[family-name:var(--font-mono)]">
                            {transfer.destination}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                          {transfer.status}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-white/50">{transfer.note}</p>
                      {transfer.policyReason ? (
                        <p className="mt-2 text-[11px] text-white/35">{transfer.policyReason}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-white/35">
                        <span>Approvals: {transfer.approvalsReceived}/{transfer.approvalsRequired}</span>
                        {transfer.unlockAt ? <span>Unlocks: {new Date(transfer.unlockAt).toLocaleString()}</span> : null}
                        {transfer.txHash ? <span className="font-[family-name:var(--font-mono)]">Tx: {transfer.txHash}</span> : null}
                      </div>
                      {transfer.executedAt ? (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-[11px] text-green-300">
                          <CheckCircle2 size={12} />
                          Executed {formatTimestamp(transfer.executedAt)}
                        </div>
                      ) : canExecute ? (
                        <button
                          type="button"
                          onClick={() => handleExecuteTransfer(transfer)}
                          disabled={isExecuting}
                          className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                        >
                          {isExecuting ? <Loader2 size={12} className="animate-spin" /> : null}
                          {isExecuting ? 'Signing Safe Tx…' : 'Execute with MetaMask'}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isReviewer ? (
            <div className="glass p-5 rounded-2xl">
              <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-1">
                Safe Review Queue
              </h2>
              <p className="text-[11px] text-white/30">
                Queued transfers need reviewer approval after the timelock. Once approved, the agent owner executes the Safe transaction.
              </p>
              {reviewQueue.length === 0 ? (
                <p className="mt-4 text-sm text-white/35">
                  No queued or approved Safe transfers need review.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {reviewQueue.map((transfer) => {
                    const isLocked = !!transfer.unlockAt && new Date(transfer.unlockAt).getTime() > Date.now();
                    const canApprove = transfer.status === 'queued' && !isLocked;
                    const isApproving = approvingTransferId === transfer.id;

                    return (
                      <div key={transfer.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-white">{transfer.agentName ?? transfer.agentId}</p>
                            <p className="mt-1 text-[11px] text-white/35">
                              {transfer.amountEth} ETH to {transfer.destination}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                            {transfer.status}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-white/50">{transfer.note}</p>
                        {transfer.policyReason ? (
                          <p className="mt-2 text-[11px] text-white/35">{transfer.policyReason}</p>
                        ) : null}
                        {transfer.unlockAt ? (
                          <p className="mt-2 text-[11px] text-white/35">
                            Unlocks: {new Date(transfer.unlockAt).toLocaleString()}
                          </p>
                        ) : null}
                        {canApprove ? (
                          <button
                            type="button"
                            onClick={() => handleApproveTransfer(transfer)}
                            disabled={isApproving}
                            className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                          >
                            {isApproving ? <Loader2 size={12} className="animate-spin" /> : null}
                            {isApproving ? 'Approving…' : 'Approve transfer'}
                          </button>
                        ) : transfer.status === 'queued' ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/45">
                            <Clock size={12} />
                            Waiting for timelock
                          </div>
                        ) : (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-[11px] text-green-300">
                            <CheckCircle2 size={12} />
                            Ready for owner execution
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
