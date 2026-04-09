'use client';

import { useState, useCallback } from 'react';
import StatCard from '@/components/dashboard/StatCard';
import { useAuthContext } from '@/providers/AuthProvider';
import { useAdminOverview } from '@/hooks/useAdminOverview';
import { useAdminTasks, useAdminRetry, useAdminCancel, useAdminReassign, useAdminHold } from '@/hooks/useAdminTasks';
import { useAgents } from '@/hooks/useAgents';
import type { Task, Agent } from '@/lib/types';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  RotateCcw,
  XCircle,
  ArrowRightLeft,
  Bot,
  Zap,
  ShieldAlert,
  ChevronDown,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'failed' | 'completed';

const resultColors: Record<string, string> = {
  ALLOW: 'text-green-400',
  DENY: 'text-red-400',
  FLAG: 'text-yellow-400',
};

const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Active' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Completed' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
};

const stepBadge: Record<string, { icon: typeof Clock; color: string }> = {
  Submitted: { icon: Clock, color: 'text-white/50' },
  Decomposed: { icon: Zap, color: 'text-purple-400' },
  Assigned: { icon: Bot, color: 'text-blue-400' },
  Executing: { icon: Loader2, color: 'text-yellow-400' },
  'ZK Verifying': { icon: ShieldAlert, color: 'text-cyan-400' },
  Complete: { icon: CheckCircle, color: 'text-green-400' },
  Hold: { icon: PauseCircle, color: 'text-orange-400' },
};

function ReassignModal({
  task,
  agents,
  onReassign,
  onClose,
  isPending,
}: {
  task: Task;
  agents: Agent[];
  onReassign: (agentId: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const available = agents.filter((a) => a.status !== 'busy' && a.id !== task.assignedAgent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-1 font-[family-name:var(--font-heading)]">Reassign Task</h3>
        <p className="text-xs text-white/50 mb-4 truncate">{task.title}</p>

        {available.length === 0 ? (
          <p className="text-sm text-white/40">No available agents to reassign to.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {available.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onReassign(agent.id)}
                disabled={isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left disabled:opacity-50"
              >
                <Bot size={16} className="text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{agent.name}</p>
                  <p className="text-xs text-white/40">{agent.type} · {agent.tasksCompleted} tasks</p>
                </div>
                {isPending ? <Loader2 size={14} className="animate-spin text-white/40" /> : null}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  agents,
  onRetry,
  onCancel,
  onReassign,
  onHold,
  retryPending,
  cancelPending,
  reassignPending,
  holdPending,
}: {
  task: Task;
  agents: Agent[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onReassign: (taskId: string, agentId: string) => void;
  onHold: (id: string, release: boolean) => void;
  retryPending: boolean;
  cancelPending: boolean;
  reassignPending: boolean;
  holdPending: boolean;
}) {
  const [showReassign, setShowReassign] = useState(false);
  const badge = statusBadge[task.status] ?? statusBadge.active;
  const step = stepBadge[task.currentStep];
  const StepIcon = step?.icon ?? Clock;
  const agentName = agents.find((a) => a.id === task.assignedAgent)?.name;
  const isHeld = task.currentStep === 'Hold';
  const canRetry = task.status === 'failed' && task.assignedAgent;
  const canCancel = task.status !== 'completed';
  const canReassign = task.status !== 'completed';
  const canHold = task.status !== 'completed' && task.status !== 'failed';

  return (
    <>
      <div className="glass rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{task.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] ${step?.color ?? 'text-white/40'}`}>
                <StepIcon size={10} className={task.currentStep === 'Executing' ? 'animate-spin' : ''} />
                {task.currentStep}
              </span>
              {agentName ? (
                <span className="text-[10px] text-white/30">
                  <Bot size={10} className="inline mr-0.5" />
                  {agentName}
                </span>
              ) : null}
              {task.reward !== '0' && task.reward ? (
                <span className="text-[10px] text-white/30">{task.reward}</span>
              ) : null}
            </div>
            {task.executionFailureMessage ? (
              <p className="mt-1.5 text-xs text-red-400/80 line-clamp-2">{task.executionFailureMessage}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canRetry ? (
              <button
                onClick={() => onRetry(task.id)}
                disabled={retryPending}
                className="p-2 rounded-lg text-yellow-400 hover:bg-yellow-400/10 transition-colors disabled:opacity-50"
                title="Retry"
              >
                {retryPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              </button>
            ) : null}
            {canReassign ? (
              <button
                onClick={() => setShowReassign(true)}
                disabled={reassignPending}
                className="p-2 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors disabled:opacity-50"
                title="Reassign"
              >
                {reassignPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
              </button>
            ) : null}
            {canHold ? (
              <button
                onClick={() => onHold(task.id, isHeld)}
                disabled={holdPending}
                className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${isHeld ? 'text-green-400 hover:bg-green-400/10' : 'text-orange-400 hover:bg-orange-400/10'}`}
                title={isHeld ? 'Release from hold' : 'Put on hold'}
              >
                {holdPending ? <Loader2 size={14} className="animate-spin" /> : isHeld ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              </button>
            ) : null}
            {canCancel ? (
              <button
                onClick={() => onCancel(task.id)}
                disabled={cancelPending}
                className="p-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                title="Cancel & Refund"
              >
                {cancelPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {showReassign ? (
        <ReassignModal
          task={task}
          agents={agents}
          isPending={reassignPending}
          onReassign={(agentId) => {
            onReassign(task.id, agentId);
            setShowReassign(false);
          }}
          onClose={() => setShowReassign(false)}
        />
      ) : null}
    </>
  );
}

export default function AdminPage() {
  const { session } = useAuthContext();
  const canAccess = session?.role === 'admin' || session?.role === 'operator';
  const { data: overview } = useAdminOverview(canAccess);
  const { data: tasks = [] } = useAdminTasks(canAccess);
  const { data: agents = [] } = useAgents();
  const retryMutation = useAdminRetry();
  const cancelMutation = useAdminCancel();
  const reassignMutation = useAdminReassign();
  const holdMutation = useAdminHold();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [actionError, setActionError] = useState('');

  const handleRetry = useCallback((taskId: string) => {
    setActionError('');
    retryMutation.mutate(taskId, { onError: (err) => setActionError(err.message) });
  }, [retryMutation]);

  const handleCancel = useCallback((taskId: string) => {
    setActionError('');
    cancelMutation.mutate(taskId, { onError: (err) => setActionError(err.message) });
  }, [cancelMutation]);

  const handleReassign = useCallback((taskId: string, agentId: string) => {
    setActionError('');
    reassignMutation.mutate({ taskId, agentId }, { onError: (err) => setActionError(err.message) });
  }, [reassignMutation]);

  const handleHold = useCallback((taskId: string, release: boolean) => {
    setActionError('');
    holdMutation.mutate({ taskId, release }, { onError: (err) => setActionError(err.message) });
  }, [holdMutation]);

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <AlertTriangle size={48} className="text-yellow-400 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">
          Access Restricted
        </h2>
        <p className="text-white/50 text-sm max-w-sm">
          The operator console is limited to admin and operator accounts.
        </p>
      </div>
    );
  }

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const failedTasks = tasks.filter((t) => t.status === 'failed');
  const executingTasks = tasks.filter((t) => t.currentStep === 'Executing');
  const disputedTasks = tasks.filter((t) => t.hasOpenDispute);

  const stats = [
    {
      label: 'Active Tasks',
      value: overview ? String(overview.tasks.active) : '--',
      trend: overview ? `${overview.tasks.executing} executing` : '',
      trendUp: true,
    },
    {
      label: 'Failed Tasks',
      value: overview ? String(overview.tasks.failed) : '--',
      trend: failedTasks.length > 0 ? `${failedTasks.filter((t) => t.executionFailureRetryable).length} retryable` : 'none',
      trendUp: failedTasks.length === 0,
    },
    {
      label: 'Agents Online',
      value: overview ? String(overview.agents.online) : '--',
      trend: overview ? `${overview.agents.busy} busy` : '',
      trendUp: true,
    },
    {
      label: 'Open Alerts',
      value: overview ? String(overview.openAlerts) : '--',
      trend: overview?.openAlerts === 0 ? 'clear' : 'needs attention',
      trendUp: (overview?.openAlerts ?? 0) === 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {actionError ? (
        <div className="glass rounded-xl p-3 border border-red-500/20 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{actionError}</p>
          <button onClick={() => setActionError('')} className="ml-auto text-xs text-white/40 hover:text-white">
            dismiss
          </button>
        </div>
      ) : null}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task Management (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-[family-name:var(--font-heading)]">
              Task Management
            </h2>
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as StatusFilter)}
                className="appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white pr-7 cursor-pointer hover:bg-white/10 transition-colors"
              >
                <option value="all">All ({tasks.length})</option>
                <option value="active">Active ({tasks.filter((t) => t.status === 'active').length})</option>
                <option value="failed">Failed ({failedTasks.length})</option>
                <option value="completed">Completed ({tasks.filter((t) => t.status === 'completed').length})</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            </div>
          </div>

          {/* Priority Sections */}
          {disputedTasks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-red-400 font-medium uppercase tracking-wider">Disputed ({disputedTasks.length})</p>
              {disputedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  agents={agents}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                  onReassign={handleReassign}
                  onHold={handleHold}
                  retryPending={retryMutation.isPending}
                  cancelPending={cancelMutation.isPending}
                  reassignPending={reassignMutation.isPending}
                  holdPending={holdMutation.isPending}
                />
              ))}
            </div>
          ) : null}

          {filter === 'all' && failedTasks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-red-400 font-medium uppercase tracking-wider">Failed ({failedTasks.length})</p>
              {failedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  agents={agents}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                  onReassign={handleReassign}
                  onHold={handleHold}
                  retryPending={retryMutation.isPending}
                  cancelPending={cancelMutation.isPending}
                  reassignPending={reassignMutation.isPending}
                  holdPending={holdMutation.isPending}
                />
              ))}
            </div>
          ) : null}

          {filter === 'all' && executingTasks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-yellow-400 font-medium uppercase tracking-wider">Executing ({executingTasks.length})</p>
              {executingTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  agents={agents}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                  onReassign={handleReassign}
                  onHold={handleHold}
                  retryPending={retryMutation.isPending}
                  cancelPending={cancelMutation.isPending}
                  reassignPending={reassignMutation.isPending}
                  holdPending={holdMutation.isPending}
                />
              ))}
            </div>
          ) : null}

          {/* Filtered list (or remaining when filter=all) */}
          <div className="space-y-2">
            {filter !== 'all' ? (
              filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  agents={agents}
                  onRetry={handleRetry}
                  onCancel={handleCancel}
                  onReassign={handleReassign}
                  onHold={handleHold}
                  retryPending={retryMutation.isPending}
                  cancelPending={cancelMutation.isPending}
                  reassignPending={reassignMutation.isPending}
                  holdPending={holdMutation.isPending}
                />
              ))
            ) : (
              tasks
                .filter((t) => t.status !== 'failed' && t.currentStep !== 'Executing' && !t.hasOpenDispute)
                .map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    agents={agents}
                    onRetry={handleRetry}
                    onCancel={handleCancel}
                    onReassign={handleReassign}
                    onHold={handleHold}
                    retryPending={retryMutation.isPending}
                    cancelPending={cancelMutation.isPending}
                    reassignPending={reassignMutation.isPending}
                    holdPending={holdMutation.isPending}
                  />
                ))
            )}

            {filteredTasks.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-sm text-white/30">No tasks match this filter.</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Audit Log (1 col) */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-[family-name:var(--font-heading)]">
            Recent Audit
          </h2>
          <div className="glass rounded-2xl p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {overview?.recentAudit.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 pb-3 border-b border-white/5 last:border-0 last:pb-0">
                <div className="mt-0.5 shrink-0">
                  {entry.result === 'ALLOW' ? (
                    <CheckCircle size={12} className="text-green-400" />
                  ) : entry.result === 'DENY' ? (
                    <XCircle size={12} className="text-red-400" />
                  ) : (
                    <AlertTriangle size={12} className="text-yellow-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 font-medium">{entry.action}</p>
                  <p className="text-[10px] text-white/30 truncate">{entry.target}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-white/20 truncate">{entry.actor}</span>
                    <span className={`text-[10px] font-medium ${resultColors[entry.result] ?? 'text-white/30'}`}>
                      {entry.result}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-white/20 shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {!overview?.recentAudit.length ? (
              <p className="text-xs text-white/30 text-center py-4">No recent audit entries.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
