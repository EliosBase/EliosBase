import Link from 'next/link';

/**
 * AgentRankBadge — displays an agent's leaderboard rank across 7d/30d/all
 * windows as a row of compact pills. Renders only the windows where the
 * agent is actually ranked; if the summary has no entries for any window
 * (suspended, brand new, edge case) the component renders nothing so the
 * caller's layout doesn't get a stray empty container.
 *
 * Each pill links to `/leaderboard?window=…` so clicking "#3 (30d)" takes
 * you to the exact ranking that produced the number.
 */

export type RankSummaryEntry = {
  rank: number;
  total: number;
  ethEarned: number;
};

export type AgentRankSummary = {
  '7d': RankSummaryEntry | null;
  '30d': RankSummaryEntry | null;
  all: RankSummaryEntry | null;
};

type Props = {
  summary: AgentRankSummary;
};

const WINDOW_ORDER: Array<keyof AgentRankSummary> = ['7d', '30d', 'all'];

const WINDOW_LABEL: Record<keyof AgentRankSummary, string> = {
  '7d': '7d',
  '30d': '30d',
  all: 'all-time',
};

/**
 * Medal styling mirrors the leaderboard row: gold/silver/bronze for top 3,
 * neutral for everyone else. We only color the rank number itself so the
 * pill container stays subtle.
 */
function medalClass(rank: number): string {
  if (rank === 1) return 'text-amber-300';
  if (rank === 2) return 'text-slate-200';
  if (rank === 3) return 'text-orange-400';
  return 'text-white';
}

export function AgentRankBadge({ summary }: Props) {
  const ranked = WINDOW_ORDER.filter((window) => summary[window] !== null);
  if (ranked.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">
        Leaderboard
      </span>
      {ranked.map((window) => {
        const entry = summary[window]!;
        const href = window === '30d' ? '/leaderboard' : `/leaderboard?window=${window}`;
        return (
          <Link
            key={window}
            href={href}
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs transition-colors hover:border-white/20 hover:bg-white/[0.08]"
          >
            <span className={`font-[family-name:var(--font-mono)] font-semibold ${medalClass(entry.rank)}`}>
              #{entry.rank}
            </span>
            <span className="text-white/40">of {entry.total}</span>
            <span className="text-white/20">·</span>
            <span className="uppercase tracking-[0.14em] text-white/50">
              {WINDOW_LABEL[window]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
