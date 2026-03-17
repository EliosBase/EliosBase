import { ShieldCheck, Clock, AlertTriangle } from 'lucide-react';

interface ProofBadgeProps {
  status: 'verified' | 'verifying' | 'pending' | 'failed';
  proofId?: string;
}

const config = {
  verified: { icon: ShieldCheck, label: 'ZK Verified', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
  verifying: { icon: Clock, label: 'Verifying', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  pending: { icon: Clock, label: 'Pending', className: 'bg-white/5 text-white/50 border-white/10' },
  failed: { icon: AlertTriangle, label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function ProofBadge({ status, proofId }: ProofBadgeProps) {
  const { icon: Icon, label, className } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${className}`}>
      <Icon size={12} />
      {label}
      {proofId && (
        <span className="text-[10px] opacity-60 font-[family-name:var(--font-mono)]">{proofId}</span>
      )}
    </span>
  );
}
