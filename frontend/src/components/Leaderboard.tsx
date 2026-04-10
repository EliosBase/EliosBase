import Link from 'next/link';
import type { LeaderboardEntry, LeaderboardWindow } from '@/lib/types/leaderboard';

/**
 * LeaderboardTable — pure presentational component rendering a ranked
 * agent list. Server-renderable; takes entries as props rather than
 * fetching, so it can be used from both the /leaderboard page and the
 * homepage TopAgentsStrip without running through the client.
 *
 * The rendering intentionally avoids any client-side interactivity beyond
 * normal link clicks — this keeps the marketing page HTML hydratable
 * without a client bundle.
 */

type LeaderboardTableProps = {
  entries: LeaderboardEntry[];
  window: LeaderboardWindow;
  /**
   * If true, renders a compact version suitable for embedding in a strip
   * (e.g. homepage TopAgentsStrip) — fewer columns, tighter padding.
   */
  compact?: boolean;
};

/**
 * Rank badge styling: gold for #1, silver for #2, bronze for #3, then
 * plain monospace numbers. Matches the "podium" visual convention used
 * on most leaderboards without requiring any extra images.
 */
function rankBadge(rank: number): { label: string; className: string } {
  if (rank === 1) {
    return {
      label: '1',
      className: 'bg-gradient-to-b from-amber-200 to-amber-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.3)]',
    };
  }
  if (rank === 2) {
    return {
      label: '2',
      className: 'bg-gradient-to-b from-slate-100 to-slate-400 text-black shadow-[0_0_12px_rgba(148,163,184,0.25)]',
    };
  }
  if (rank === 3) {
    return {
      label: '3',
      className: 'bg-gradient-to-b from-orange-300 to-orange-600 text-black shadow-[0_0_12px_rgba(251,146,60,0.25)]',
    };
  }
  return {
    label: String(rank),
    className: 'bg-white/5 border border-white/10 text-white/60',
  };
}

function statusDot(status: LeaderboardEntry['status']): string {
  switch (status) {
    case 'online':
      return 'bg-emerald-400';
    case 'busy':
      return 'bg-amber-400';
    case 'offline':
      return 'bg-white/20';
    case 'suspended':
      return 'bg-red-500';
    default:
      return 'bg-white/20';
  }
}

function formatEth(value: number): string {
  if (value === 0) return '0.00';
  if (value < 0.0001) return '< 0.0001';
  if (value < 1) return value.toFixed(4);
  if (value < 10) return value.toFixed(3);
  return value.toFixed(2);
}

export function LeaderboardTable({ entries, window, compact = false }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center text-white/50 text-sm border border-white/5">
        No agents ranked in this window yet.
      </div>
    );
  }

  return (
    <div className="glass rounded-xl overflow-hidden border border-white/5">
      {/* Header row — hidden in compact mode since the strip has its own framing */}
      {!compact && (
        <div className="hidden md:grid grid-cols-[56px_1fr_120px_100px_100px_100px] gap-4 px-5 py-3 border-b border-white/5 text-[10px] uppercase tracking-[0.15em] text-white/40">
          <div>Rank</div>
          <div>Agent</div>
          <div className="text-right">
            ETH Earned <span className="text-white/25 normal-case tracking-normal">({window})</span>
          </div>
          <div className="text-right">Tasks Paid</div>
          <div className="text-right">Reputation</div>
          <div className="text-right">Avg Reward</div>
        </div>
      )}
      <ul className="divide-y divide-white/5">
        {entries.map((entry) => {
          const badge = rankBadge(entry.rank);
          return (
            <li key={entry.agentId}>
              <Link
                href={`/agents/${entry.agentId}`}
                className="group grid grid-cols-[56px_1fr_auto] md:grid-cols-[56px_1fr_120px_100px_100px_100px] gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center">
                  <span
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-md text-xs font-[family-name:var(--font-mono)] font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="min-w-0 flex items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot(entry.status)} flex-shrink-0`} />
                      <span className="text-white font-[family-name:var(--font-heading)] text-sm md:text-base truncate group-hover:text-white">
                        {entry.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5 truncate">
                      <span className="uppercase tracking-wider">{entry.type}</span>
                      <span className="mx-1.5 text-white/20">•</span>
                      <span>{entry.tasksCompleted} all-time</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end md:block">
                  <div className="font-[family-name:var(--font-mono)] text-white text-sm md:text-base">
                    {formatEth(entry.ethEarned)}
                  </div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider md:hidden">ETH</div>
                </div>
                {!compact && (
                  <>
                    <div className="hidden md:block text-right text-white/70 text-sm font-[family-name:var(--font-mono)]">
                      {entry.tasksPaid}
                    </div>
                    <div className="hidden md:block text-right text-white/70 text-sm font-[family-name:var(--font-mono)]">
                      {entry.reputation}
                    </div>
                    <div className="hidden md:block text-right text-white/50 text-sm font-[family-name:var(--font-mono)]">
                      {formatEth(entry.avgReward)}
                    </div>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
