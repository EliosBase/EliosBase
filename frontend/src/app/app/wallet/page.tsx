'use client';

import StatCard from '@/components/dashboard/StatCard';
import TransactionRow from '@/components/dashboard/TransactionRow';
import WalletTransferCard from '@/components/dashboard/WalletTransferCard';
import { useTransactions } from '@/hooks/useTransactions';
import { useWalletStats } from '@/hooks/useWalletStats';
import { useAuthContext } from '@/providers/AuthProvider';
import { Shield, Users, Clock, Zap } from 'lucide-react';

const smartWalletFeatures = [
  { icon: Shield, name: 'Spending Limits', description: 'Per-task cap of 1.0 ETH, daily cap of 5.0 ETH', active: true },
  { icon: Users, name: 'Multi-Sig (2/3)', description: 'Required for withdrawals above 2.0 ETH', active: true },
  { icon: Clock, name: 'Time Lock', description: '24h delay on large transfers, cancel anytime', active: true },
  { icon: Zap, name: 'Auto-Escrow', description: 'Funds automatically locked when tasks are submitted', active: true },
];

export default function WalletPage() {
  const { isAuthenticated } = useAuthContext();
  const { data: transactions = [], isLoading } = useTransactions(isAuthenticated);
  const { data: stats } = useWalletStats(isAuthenticated);

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
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {walletStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Smart Wallet Features */}
        <div>
          <div className="space-y-6">
            <WalletTransferCard />

            <div className="glass p-5 rounded-2xl">
              <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-1">
                ERC-7579 Smart Wallet
              </h2>
              <p className="text-[11px] text-white/30 mb-4 font-[family-name:var(--font-body)]">
                Modular account abstraction with built-in safety
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
          </div>
        </div>

        {/* Transaction History */}
        <div className="lg:col-span-2">
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
        </div>
      </div>
    </div>
  );
}
