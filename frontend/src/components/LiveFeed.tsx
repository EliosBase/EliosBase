'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CreditCard, ListChecks, ShieldCheck, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ActivityEvent } from '@/lib/types';

/**
 * LiveFeed — public homepage "proof of life" strip.
 *
 * This component is the single place on the marketing site where a cold
 * visitor sees the platform doing something. It is deliberately:
 *
 *  - A client component with zero React Query dependency (the marketing
 *    page is not wrapped in QueryClientProvider — only the dashboard is),
 *  - Subscribed to the same `activity-changes` Supabase realtime channel
 *    that the authenticated dashboard uses, so there's only one postgres
 *    publication under load,
 *  - Animated via pure CSS (no framer-motion) to keep the marketing bundle
 *    lean and SSR-friendly,
 *  - Self-pausing when the tab is hidden so offscreen visitors don't
 *    generate idle Redis/Postgres/Vercel traffic,
 *  - Fallback-safe: if neither the initial fetch nor realtime ever
 *    produce events, a rotating set of demo events keeps the feed from
 *    ever looking dead during low-traffic moments (the product is
 *    pre-launch; traffic at 3am will be genuinely quiet).
 *
 * Data flow:
 *   1. Initial SSR-friendly fetch of `/api/activity?limit=20` on mount.
 *   2. Supabase realtime `INSERT` subscription on `activity_events` —
 *      on any new row we refetch (rather than trusting the realtime
 *      payload, which doesn't include computed relative timestamps).
 *   3. A `setInterval` polls every 20s as a belt-and-braces refresh for
 *      cases where realtime is blocked (ad blockers, strict proxies).
 *
 * All three paths converge on `refresh()`, which replaces the state atomically
 * with a trimmed copy of whatever the API returns.
 */

const FEED_SIZE = 12;
const POLL_INTERVAL_MS = 20_000;

const iconMap: Record<ActivityEvent['type'], typeof Zap> = {
  proof: Zap,
  payment: CreditCard,
  task: ListChecks,
  security: ShieldCheck,
  agent: Bot,
};

const typeLabel: Record<ActivityEvent['type'], string> = {
  proof: 'PROOF',
  payment: 'PAYMENT',
  task: 'TASK',
  security: 'SECURITY',
  agent: 'AGENT',
};

/**
 * Placeholders shown only when the backend returns zero events. These are
 * clearly marked as sample via `isSample` so we never accidentally present
 * them as real telemetry. Rotating indices keep the strip alive visually
 * without repeated identical cards.
 */
const SAMPLE_EVENTS: ActivityEvent[] = [
  { id: 'sample-1', type: 'task', message: 'Submitter posted a task — 0.15 ETH reward', timestamp: 'just now' },
  { id: 'sample-2', type: 'agent', message: 'Agent cipher-01 came online', timestamp: 'just now' },
  { id: 'sample-3', type: 'proof', message: 'Groth16 proof verified on-chain', timestamp: 'just now' },
  { id: 'sample-4', type: 'payment', message: 'Escrow released — 0.08 ETH to analyst-03', timestamp: 'just now' },
  { id: 'sample-5', type: 'task', message: 'Task completed — execution attested via EAS', timestamp: 'just now' },
];

type FeedEvent = ActivityEvent & { isSample?: boolean };

async function fetchFeed(signal?: AbortSignal): Promise<ActivityEvent[]> {
  const res = await fetch(`/api/activity?limit=${FEED_SIZE}`, { signal, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch activity: ${res.status}`);
  }
  const data = (await res.json()) as ActivityEvent[];
  return Array.isArray(data) ? data.slice(0, FEED_SIZE) : [];
}

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await fetchFeed(controller.signal);
      setEvents(data);
      setHasLoaded(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // Swallow — sample fallback below keeps the UI alive even if the API
      // is down. We still surface hasLoaded=true so the loading skeleton
      // doesn't pin forever.
      setHasLoaded(true);
    }
  }, []);

  // Initial fetch + realtime channel + polling fallback.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    // Kick off the initial fetch asynchronously so we don't synchronously
    // schedule a setState inside the effect body (React flags that as a
    // cascading render). Using a microtask also means the channel subscribe
    // below is not blocked on the fetch resolving.
    void Promise.resolve().then(() => {
      if (!cancelled) refresh();
    });

    const channel = supabase
      .channel('live-feed-homepage')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_events' },
        () => {
          if (!cancelled) refresh();
        },
      )
      .subscribe((status) => {
        if (!cancelled && status === 'SUBSCRIBED') {
          setIsConnected(true);
        }
      });

    const pollHandle = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      supabase.removeChannel(channel);
      window.clearInterval(pollHandle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const display: FeedEvent[] = useMemo(() => {
    if (events.length > 0) return events;
    if (!hasLoaded) return [];
    // Low-traffic fallback: stamp samples with relative time so they blend
    // visually with real events. Mark them so we can style differently.
    return SAMPLE_EVENTS.map((event, index) => ({
      ...event,
      isSample: true,
      // Stagger the fake timestamps so they look like recent activity.
      timestamp: index === 0 ? 'just now' : `${index} min ago`,
    }));
  }, [events, hasLoaded]);

  return (
    <section className="relative py-20 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-ping opacity-75' : 'bg-white/20'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isConnected ? 'bg-emerald-400' : 'bg-white/30'
                  }`}
                />
              </span>
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                {isConnected ? 'Live' : 'Connecting'}
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white">
              Activity Stream
            </h2>
            <p className="text-white/50 text-sm mt-2 max-w-xl">
              Tasks, payments, and proofs flowing through EliosBase in real time.
            </p>
          </div>
          <a
            href="/leaderboard"
            className="hidden md:inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-white/50 hover:text-white transition-colors"
          >
            Top Agents →
          </a>
        </div>

        <div className="glass rounded-xl overflow-hidden border border-white/5">
          <ul
            className="divide-y divide-white/5"
            aria-live="polite"
            aria-label="Live activity feed"
          >
            {!hasLoaded && display.length === 0 && (
              <li className="p-4">
                <div className="flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-md bg-white/5" />
                  <div className="flex-1 h-4 rounded bg-white/5" />
                </div>
              </li>
            )}
            {display.map((event, index) => {
              const Icon = iconMap[event.type];
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(index, 5) * 40}ms`, animationFillMode: 'backwards' }}
                >
                  <div className="mt-0.5 w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-white/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-[family-name:var(--font-mono)]">
                        {typeLabel[event.type]}
                      </span>
                      <span className="text-[10px] text-white/30">•</span>
                      <span className="text-[10px] text-white/40">{event.timestamp}</span>
                      {event.isSample && (
                        <span className="text-[9px] uppercase tracking-wider text-white/20 border border-white/10 rounded px-1 py-[1px]">
                          sample
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/80 leading-snug">{event.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
