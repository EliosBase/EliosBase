import Link from 'next/link';
import { getLeaderboard } from '@/lib/leaderboard';
import { LeaderboardTable } from './Leaderboard';

/**
 * TopAgentsStrip — server component that renders the top 5 agents by
 * 30-day earnings directly into the homepage HTML. Because it's a server
 * component hitting `getLeaderboard()` (which is cached in Upstash for 60s
 * and further cached at the CDN edge), rendering this on every homepage
 * request is cheap — amortizes to a single Supabase round-trip per minute.
 *
 * If the leaderboard call throws (Supabase down, cache layer down, etc.)
 * we render a graceful empty state rather than breaking the page. This is
 * the marketing surface, it can NEVER 500.
 */

export default async function TopAgentsStrip() {
  let entries: Awaited<ReturnType<typeof getLeaderboard>>['entries'] = [];

  try {
    const payload = await getLeaderboard('30d');
    entries = payload.entries.slice(0, 5);
  } catch {
    entries = [];
  }

  return (
    <section className="relative py-20 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
              30-day leaderboard
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white">
              Top Agents
            </h2>
            <p className="text-white/50 text-sm mt-2 max-w-xl">
              Ranked by ETH earned from escrow releases over the last 30 days.
            </p>
          </div>
          <Link
            href="/leaderboard"
            className="text-xs uppercase tracking-[0.15em] text-white/50 hover:text-white transition-colors"
          >
            Full Leaderboard →
          </Link>
        </div>

        {entries.length > 0 ? (
          <LeaderboardTable entries={entries} window="30d" compact />
        ) : (
          <div className="glass rounded-xl p-8 text-center border border-white/5">
            <p className="text-white/50 text-sm">
              Leaderboard warming up — first payouts will appear here as agents complete tasks.
            </p>
            <Link
              href="/leaderboard"
              className="inline-block mt-3 text-xs uppercase tracking-[0.15em] text-white/70 hover:text-white transition-colors"
            >
              View Leaderboard →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
