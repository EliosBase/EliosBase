import { ShieldCheck, Clock, AlertTriangle, ExternalLink } from 'lucide-react';

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
  const isOnChainTx = proofId?.startsWith('0x') && proofId.length === 66;
  const baseScanUrl = isOnChainTx ? `https://basescan.org/tx/${proofId}` : undefined;

  const badge = (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${className} ${baseScanUrl ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}>
      <Icon size={12} />
      {label}
      {baseScanUrl && <ExternalLink size={10} />}
    </span>
  );

  if (baseScanUrl) {
    return (
      <a href={baseScanUrl} target="_blank" rel="noopener noreferrer">
        {badge}
      </a>
    );
  }

  return badge;
}
