import { type Transaction } from '@/lib/mock-data';
import { ArrowUpRight, ArrowDownLeft, Lock, Unlock, Award } from 'lucide-react';

const typeConfig = {
  escrow_lock: { icon: Lock, label: 'Escrow Lock', color: 'text-yellow-400' },
  escrow_release: { icon: Unlock, label: 'Escrow Release', color: 'text-green-400' },
  payment: { icon: ArrowUpRight, label: 'Payment', color: 'text-red-400' },
  reward: { icon: Award, label: 'Reward', color: 'text-green-400' },
  stake: { icon: ArrowDownLeft, label: 'Stake', color: 'text-blue-400' },
};

const statusStyles = {
  confirmed: 'bg-green-500/10 text-green-400',
  pending: 'bg-yellow-500/10 text-yellow-400',
  failed: 'bg-red-500/10 text-red-400',
};

interface TransactionRowProps {
  tx: Transaction;
}

export default function TransactionRow({ tx }: TransactionRowProps) {
  const { icon: Icon, label, color } = typeConfig[tx.type];

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition-colors rounded-lg">
      <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 font-[family-name:var(--font-body)]">{label}</p>
        <p className="text-[11px] text-white/30 font-[family-name:var(--font-mono)] truncate">
          {tx.from} → {tx.to}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-medium text-white font-[family-name:var(--font-mono)]">
          {tx.amount} {tx.token}
        </p>
        <div className="flex items-center gap-2 justify-end mt-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusStyles[tx.status]}`}>
            {tx.status}
          </span>
          <span className="text-[10px] text-white/25 font-[family-name:var(--font-mono)]">
            {tx.txHash}
          </span>
        </div>
      </div>
    </div>
  );
}
