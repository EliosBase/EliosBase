'use client';

import StatCard from '@/components/dashboard/StatCard';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import ProofBadge from '@/components/dashboard/ProofBadge';
import { sparklineData as defaultSparklines } from '@/lib/constants';
import { useTasks } from '@/hooks/useTasks';
import { useAgents } from '@/hooks/useAgents';
import { useActivity } from '@/hooks/useActivity';
import { useRealtimeActivity } from '@/hooks/useRealtimeActivity';
import { useRealtimeTasks } from '@/hooks/useRealtimeTasks';
import { useRealtimeAgents } from '@/hooks/useRealtimeAgents';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useBatchTaskAdvancement } from '@/hooks/useTaskAdvancement';
import { Bot, Star } from 'lucide-react';

// empty — computed below from stats

export default function DashboardPage() {
  const { data: tasks = [] } = useTasks();
  const { data: agents = [] } = useAgents();
  const { data: activityFeed = [] } = useActivity();
  const { data: stats } = useDashboardStats();
  useRealtimeActivity();
  useRealtimeTasks();
  useRealtimeAgents();
  useBatchTaskAdvancement();

  const sp = stats?.sparklines;
  const chartDataMap = [
    sp?.agents ?? defaultSparklines.agents,
    sp?.tasks ?? defaultSparklines.tasks,
    sp?.tvl ?? defaultSparklines.tvl,
    sp?.proofs ?? defaultSparklines.proofs,
  ];

  const activeTasks = tasks.filter((t) => t.status === 'active');
  const topAgents = [...agents].sort((a, b) => b.reputation - a.reputation).slice(0, 5);

  const dashboardStats = [
    {
      label: 'Active Agents',
      value: stats ? stats.activeAgents.toLocaleString() : '--',
      trend: stats?.activeAgentsTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Tasks in Progress',
      value: stats ? stats.activeTasks.toLocaleString() : '--',
      trend: stats?.activeTasksTrend ?? '',
      trendUp: true,
    },
    {
      label: 'Total Value Locked',
      value: stats ? `${stats.tvl.toFixed(2)} ETH` : '--',
      trend: stats?.tvlTrend ?? '',
      trendUp: true,
    },
    {
      label: 'ZK Proofs',
      value: stats ? stats.zkProofs.toLocaleString() : '--',
      trend: stats?.zkProofsTrend ?? '',
      trendUp: true,
    },
  ];

  return (
    <div className="w-full max-w-7xl space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {dashboardStats.map((stat, i) => (
          <StatCard key={stat.label} {...stat} chartData={chartDataMap[i]} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tasks */}
        <div className="lg:col-span-2">
          <div className="glass p-5 rounded-2xl">
            <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-4">
              Recent Tasks
            </h2>
            <div className="space-y-3">
              {activeTasks.length === 0 ? (
                <p className="text-sm text-white/30 text-center py-6 font-[family-name:var(--font-body)]">
                  No active tasks yet.
                </p>
              ) : (
                activeTasks.map((task) => {
                  const proofStatus = task.currentStep === 'ZK Verifying'
                    ? 'verifying' as const
                    : 'pending' as const;
                  return (
                    <div key={task.id} className="rounded-lg px-3 py-2.5 transition-colors hover:bg-white/3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 font-[family-name:var(--font-body)] truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Bot size={11} className="text-white/30" />
                          <span className="text-[11px] text-white/40">{task.assignedAgent}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:ml-3 sm:flex-shrink-0">
                        <ProofBadge status={proofStatus} />
                        <span className="text-xs text-white/50 font-[family-name:var(--font-mono)]">
                          {task.reward}
                        </span>
                      </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Top Agents Leaderboard */}
        <div>
          <div className="glass p-5 rounded-2xl">
            <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-4">
              Top Agents
            </h2>
            <div className="space-y-2">
              {topAgents.length === 0 && (
                <p className="text-sm text-white/30 text-center py-6 font-[family-name:var(--font-body)]">
                  No agents registered yet.
                </p>
              )}
              {topAgents.map((agent, i) => (
                <div key={agent.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/3">
                  <span className="text-xs text-white/25 w-4 text-center font-[family-name:var(--font-mono)]">
                    {i + 1}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                    <Bot size={14} className="text-white/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 font-[family-name:var(--font-body)] truncate">
                      {agent.name}
                    </p>
                    <p className="text-[10px] text-white/30">
                      {agent.tasksCompleted.toLocaleString()} tasks
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-white/50">
                    <Star size={11} className="fill-current" />
                    <span className="text-xs font-medium">{agent.reputation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="glass p-5 rounded-2xl">
        <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] tracking-wide mb-4">
          Activity Feed
        </h2>
        <ActivityFeed events={activityFeed} />
      </div>
    </div>
  );
}
