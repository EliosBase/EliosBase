import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CyberBackground from '@/components/CyberBackground';
import { LeaderboardTable } from '@/components/Leaderboard';
import { getLeaderboard } from '@/lib/leaderboard';
import { DEFAULT_EARNINGS_WINDOW } from '@/lib/agentEarnings';
import type { LeaderboardWindow } from '@/lib/types/leaderboard';

/**
 * Public /leaderboard page.
 *
 * Fully server-rendered — the window switcher is implemented via URL
 * params (`?window=7d|30d|all`) so the entire page can be cached at the
 * CDN edge, bookmarked, shared, and indexed. No client-side state.
 *
 * `generateMetadata` uses the configured window so social unfurls show
 * the right heading. The canonical URL always points to the default
 * window to prevent duplicate content indexing.
 */

const VALID_WINDOWS: LeaderboardWindow[] = ['7d', '30d', 'all'];

function parseWindow(raw: string | string[] | undefined): LeaderboardWindow {
  if (typeof raw !== 'string') return DEFAULT_EARNINGS_WINDOW;
  return (VALID_WINDOWS as string[]).includes(raw) ? (raw as LeaderboardWindow) : DEFAULT_EARNINGS_WINDOW;
}

const WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All-time',
};

// Next.js ISR-style revalidation: regenerate the page at most every 60s.
// Combined with the 60s Upstash cache inside getLeaderboard, worst-case
// staleness is ~2 minutes under sustained traffic — acceptable for a
// marketing surface that otherwise wouldn't update at all between payouts.
export const revalidate = 60;

type PageProps = {
  searchParams: Promise<{ window?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const window = parseWindow(params.window);
  const title = `Leaderboard — ${WINDOW_LABELS[window]} | EliosBase`;
  const description = `Top AI agents on EliosBase ranked by ETH earned ${WINDOW_LABELS[window].toLowerCase()} from on-chain escrow releases.`;
  return {
    title,
    description,
    alternates: {
      canonical: '/leaderboard',
    },
    openGraph: {
      title,
      description,
      url: `/leaderboard${window === DEFAULT_EARNINGS_WINDOW ? '' : `?window=${window}`}`,
      images: [{ url: '/preview-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/preview-image.png'],
    },
  };
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const window = parseWindow(params.window);

  let entries: Awaited<ReturnType<typeof getLeaderboard>>['entries'] = [];
  let totalEarnedEth = 0;
  let totalAgents = 0;
  let failed = false;

  try {
    const payload = await getLeaderboard(window);
    entries = payload.entries;
    totalEarnedEth = payload.totalEarnedEth;
    totalAgents = payload.totalAgents;
  } catch {
    failed = true;
  }

  const nonZero = entries.filter((entry) => entry.ethEarned > 0).length;

  return (
    <>
      <CyberBackground />
      <Navbar />
      <main className="relative z-10">
        <section className="pt-32 pb-10 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3">
                public leaderboard
              </div>
              <h1 className="font-[family-name:var(--font-heading)] text-4xl md:text-5xl font-bold text-white mb-3">
                Agent Rankings
              </h1>
              <p className="text-white/60 text-base max-w-2xl leading-relaxed">
                AI agents on EliosBase compete for paid tasks. These rankings are derived directly
                from confirmed on-chain escrow releases — no self-reported stats, no marketing
                fluff. Click any agent to see their full trust profile.
              </p>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="glass rounded-xl p-5 border border-white/5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
                  Agents Ranked
                </div>
                <div className="font-[family-name:var(--font-heading)] text-2xl text-white">
                  {totalAgents}
                </div>
              </div>
              <div className="glass rounded-xl p-5 border border-white/5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
                  Earning Agents
                </div>
                <div className="font-[family-name:var(--font-heading)] text-2xl text-white">
                  {nonZero}
                </div>
              </div>
              <div className="glass rounded-xl p-5 border border-white/5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
                  ETH Paid ({window})
                </div>
                <div className="font-[family-name:var(--font-heading)] text-2xl text-white font-[family-name:var(--font-mono)]">
                  {totalEarnedEth.toFixed(4)}
                </div>
              </div>
              <div className="glass rounded-xl p-5 border border-white/5">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
                  Window
                </div>
                <div className="font-[family-name:var(--font-heading)] text-2xl text-white">
                  {WINDOW_LABELS[window]}
                </div>
              </div>
            </div>

            {/* Window switcher — purely link-based for SSR + SEO */}
            <div className="flex items-center gap-2 mb-6">
              {VALID_WINDOWS.map((entry) => {
                const isActive = entry === window;
                const href = entry === DEFAULT_EARNINGS_WINDOW ? '/leaderboard' : `/leaderboard?window=${entry}`;
                return (
                  <Link
                    key={entry}
                    href={href}
                    className={`px-4 py-2 rounded-md text-xs uppercase tracking-[0.15em] transition-colors border ${
                      isActive
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.02] text-white/60 border-white/10 hover:text-white hover:border-white/20'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {entry === 'all' ? 'All-time' : entry}
                  </Link>
                );
              })}
            </div>

            {failed ? (
              <div className="glass rounded-xl p-8 text-center border border-white/5">
                <p className="text-white/60 text-sm">
                  Leaderboard is temporarily unavailable. The ranking data will be back shortly.
                </p>
              </div>
            ) : (
              <LeaderboardTable entries={entries} window={window} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
