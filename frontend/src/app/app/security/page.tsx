'use client';

import { useState, useCallback } from 'react';
import StatCard from '@/components/dashboard/StatCard';
import SecurityAlertComponent from '@/components/dashboard/SecurityAlert';
import { useSecurityAlerts } from '@/hooks/useSecurityAlerts';
import { useGuardrails } from '@/hooks/useGuardrails';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useSecurityStats } from '@/hooks/useSecurityStats';
import { useAuthContext } from '@/providers/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldOff, AlertTriangle, Loader2 } from 'lucide-react';

const guardrailStatusStyles = {
  active: { dot: 'bg-green-500', label: 'Active', textColor: 'text-green-400' },
  paused: { dot: 'bg-yellow-500', label: 'Paused', textColor: 'text-yellow-400' },
  triggered: { dot: 'bg-red-500', label: 'Triggered', textColor: 'text-red-400' },
};

const resultColors: Record<string, string> = {
  ALLOW: 'text-green-400',
  DENY: 'text-red-400',
  FLAG: 'text-yellow-400',
};

export default function SecurityPage() {
  const { isAuthenticated, session } = useAuthContext();
  const canAccessSecurity = session?.role === 'admin' || session?.role === 'operator';
  const { data: securityAlerts = [] } = useSecurityAlerts(canAccessSecurity);
  const { data: guardrails = [] } = useGuardrails(canAccessSecurity);
  const { data: auditLog = [] } = useAuditLog(canAccessSecurity);
  const { data: stats } = useSecurityStats(canAccessSecurity);
  const queryClient = useQueryClient();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState('');

  const securityStats = [
    {
      label: 'Threats Blocked',
      value: stats ? String(stats.threatsBlocked) : '--',
      trend: stats?.threatsBlockedTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Guardrails Active',
      value: stats ? `${stats.guardrailsActive}/${stats.guardrailsTotal}` : '--',
      trend: stats?.guardrailsTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Proofs Verified',
      value: stats ? stats.proofsVerified.toLocaleString() : '--',
      trend: stats?.proofsTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Uptime',
      value: stats?.uptime ?? '--',
      trend: stats?.uptimeTrend ?? '',
      trendUp: true,
    },
  ];

  const toggleGuardrail = useCallback(async (id: string, currentStatus: string) => {
    if (togglingId) return;
    setTogglingId(id);
    setToggleError('');
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      const res = await fetch(`/api/security/guardrails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        setToggleError(data.error || 'Failed to toggle guardrail');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['guardrails'] });
      queryClient.invalidateQueries({ queryKey: ['security-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-log'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch {
      setToggleError('Network error');
    } finally {
      setTogglingId(null);
    }
  }, [togglingId, queryClient]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">
          Connect your wallet and sign in to view security data.
        </p>
      </div>
    );
  }

  if (!canAccessSecurity) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-white/40 text-sm font-[family-name:var(--font-body)]">
          Security Center is limited to operator and admin accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {securityStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-white/50" />
              <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide">
                Security Alerts
              </h2>
            </div>
            <div className="space-y-3">
              {securityAlerts.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-6 font-[family-name:var(--font-body)]">
                  No security alerts.
                </p>
              ) : (
                securityAlerts.map((alert) => (
                  <SecurityAlertComponent key={alert.id} alert={alert} />
                ))
              )}
            </div>
          </div>

          {/* Audit Log */}
          <div className="glass p-5 rounded-2xl">
            <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-4">
              Zero-Trust Audit Log
            </h2>
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[80px_1fr_1fr_1fr_60px] gap-2 px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-[family-name:var(--font-mono)] border-b border-white/6">
                  <span>Time</span>
                  <span>Action</span>
                  <span>Actor</span>
                  <span>Target</span>
                  <span>Result</span>
                </div>
                {auditLog.length === 0 && (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-white/30 font-[family-name:var(--font-body)]">No audit entries yet.</p>
                  </div>
                )}
                {auditLog.map((entry, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[80px_1fr_1fr_1fr_60px] gap-2 px-3 py-2 text-xs font-[family-name:var(--font-mono)] hover:bg-white/3 transition-colors border-b border-white/3 last:border-0"
                  >
                    <span className="text-white/40">{entry.timestamp}</span>
                    <span className="text-white/60">{entry.action}</span>
                    <span className="text-white/40 truncate">{entry.actor}</span>
                    <span className="text-white/40 truncate">{entry.target}</span>
                    <span className={`font-semibold ${resultColors[entry.result]}`}>{entry.result}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Guardrails Panel */}
        <div>
          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} className="text-white/50" />
              <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide">
                Guardrails
              </h2>
            </div>
            {toggleError && (
              <p className="text-[10px] text-red-400 mb-3">{toggleError}</p>
            )}
            <div className="space-y-3">
              {guardrails.map((gr) => {
                const style = guardrailStatusStyles[gr.status];
                const isToggling = togglingId === gr.id;
                return (
                  <div key={gr.id} className="p-3 rounded-lg bg-white/3 border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {gr.status === 'triggered' ? (
                          <ShieldOff size={14} className="text-red-400" />
                        ) : (
                          <Shield size={14} className="text-white/40" />
                        )}
                        <h4 className="text-sm text-white/80 font-[family-name:var(--font-body)]">
                          {gr.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          <span className={`text-[10px] ${style.textColor}`}>{style.label}</span>
                        </div>
                        <button
                          onClick={() => toggleGuardrail(gr.id, gr.status)}
                          disabled={isToggling || !!togglingId}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors disabled:opacity-50 ${
                            gr.status === 'active'
                              ? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
                              : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 size={10} className="animate-spin inline" />
                          ) : gr.status === 'active' ? 'Pause' : 'Activate'}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/35 mb-1.5">{gr.description}</p>
                    <p className="text-[10px] text-white/25 font-[family-name:var(--font-mono)]">
                      Triggered {gr.triggeredCount}x total
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
