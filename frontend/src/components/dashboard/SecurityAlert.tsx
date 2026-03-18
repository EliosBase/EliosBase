import { type SecurityAlert as SecurityAlertType } from '@/lib/types';
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const severityConfig = {
  critical: { icon: AlertTriangle, bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400' },
  high: { icon: AlertCircle, bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-400' },
  medium: { icon: Info, bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  low: { icon: Info, bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
};

interface SecurityAlertProps {
  alert: SecurityAlertType;
}

export default function SecurityAlertComponent({ alert }: SecurityAlertProps) {
  const config = severityConfig[alert.severity];
  const Icon = config.icon;
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(false);

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await fetch(`/api/security/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['security-alerts'] });
        queryClient.invalidateQueries({ queryKey: ['security-stats'] });
        queryClient.invalidateQueries({ queryKey: ['audit-log'] });
        queryClient.invalidateQueries({ queryKey: ['activity'] });
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className={`${config.bg} border ${config.border} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex-shrink-0 ${config.text}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-white font-[family-name:var(--font-body)]">
              {alert.title}
            </h4>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium uppercase ${config.badge}`}>
              {alert.severity}
            </span>
            {alert.resolved && (
              <span className="flex items-center gap-1 text-[10px] text-green-400">
                <CheckCircle size={10} /> Resolved
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 leading-relaxed font-[family-name:var(--font-body)]">
            {alert.description}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-white/30 font-[family-name:var(--font-mono)]">
              {alert.source}
            </span>
            <span className="text-[10px] text-white/25">{alert.timestamp}</span>
            {!alert.resolved && (
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="ml-auto text-[10px] px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50 font-medium"
              >
                {resolving ? 'Resolving...' : 'Resolve'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
