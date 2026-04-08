import { type Transaction } from '@/lib/types';
import { ArrowUpRight, ArrowDownLeft, Lock, Unlock, Award } from 'lucide-react';
import BasenameDisplay from './BasenameDisplay';

const typeConfig = {
  escrow_lock: { icon: Lock, label: 'Escrow Lock', color: 'text-yellow-400' },
  escrow_release: { icon: Unlock, label: 'Escrow Release', color: 'text-green-400' },
  escrow_refund: { icon: Unlock, label: 'Escrow Refund', color: 'text-amber-400' },
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
  const amountLabel = tx.amount.endsWith(` ${tx.token}`) ? tx.amount : `${tx.amount} ${tx.token}`;

  return (
    <div className="rounded-lg px-4 py-3 transition-colors hover:bg-white/3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 ${color}`}>
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 font-[family-name:var(--font-body)]">{label}</p>
        <p className="text-[11px] text-white/30 font-[family-name:var(--font-mono)]">
          <BasenameDisplay address={tx.from} /> → <BasenameDisplay address={tx.to} />
        </p>
      </div>

      <div className="flex-shrink-0 text-left sm:text-right">
        <p className="text-sm font-medium text-white font-[family-name:var(--font-mono)]">
          {amountLabel}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 sm:justify-end">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusStyles[tx.status]}`}>
            {tx.status}
          </span>
          <span className="break-all text-[10px] text-white/25 font-[family-name:var(--font-mono)]">
            {tx.txHash}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
