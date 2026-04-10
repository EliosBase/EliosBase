import { ImageResponse } from 'next/og';
import { getAgentRankSummary } from '@/lib/leaderboard';
import { createServiceClient } from '@/lib/supabase/server';
import type { DbAgent } from '@/lib/types/database';

/**
 * Dynamic Open Graph image for /agents/[id]. Renders agent name, leaderboard
 * rank (best of 30d/7d/all), and headline ETH earned so the unfurl in
 * Twitter/Farcaster/Discord actually tells someone whether the agent is
 * worth clicking on.
 *
 * We run this in the Node runtime rather than the edge because the
 * rank lookup transitively hits Upstash + Supabase, and keeping everything
 * on one runtime avoids duplicating env and bundle surface. The resulting
 * image is cached aggressively by Next.js anyway.
 *
 * Failures render a neutral branded fallback image instead of throwing so
 * a dead cache layer or a missing agent never produces a broken unfurl.
 */

export const alt = 'EliosBase Agent Passport';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = {
  params: Promise<{ id: string }>;
};

function formatEth(value: number): string {
  if (value === 0) return '0';
  if (value < 0.001) return value.toFixed(4);
  if (value < 1) return value.toFixed(3);
  if (value < 10) return value.toFixed(2);
  return value.toFixed(1);
}

/**
 * Pick the most impressive rank across windows, preferring 30d (the
 * canonical leaderboard window) when the rank is equal or the agent
 * isn't ranked in one window yet.
 */
function pickHeadlineRank(summary: Awaited<ReturnType<typeof getAgentRankSummary>>):
  | { rank: number; total: number; label: string; ethEarned: number }
  | null {
  const thirty = summary['30d'];
  if (thirty) return { ...thirty, label: '30d' };
  const seven = summary['7d'];
  if (seven) return { ...seven, label: '7d' };
  const all = summary.all;
  if (all) return { ...all, label: 'all-time' };
  return null;
}

async function fetchAgentBasics(agentId: string): Promise<Pick<
  DbAgent,
  'name' | 'type' | 'status' | 'reputation' | 'tasks_completed'
> | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('agents')
      .select('name, type, status, reputation, tasks_completed')
      .eq('id', agentId)
      .single();
    if (error || !data) return null;
    return data as Pick<DbAgent, 'name' | 'type' | 'status' | 'reputation' | 'tasks_completed'>;
  } catch {
    return null;
  }
}

export default async function Image({ params }: Props) {
  const { id } = await params;

  const [agent, rankSummary] = await Promise.all([
    fetchAgentBasics(id),
    getAgentRankSummary(id).catch(() => ({ '7d': null, '30d': null, all: null })),
  ]);

  const headline = pickHeadlineRank(rankSummary);
  const name = agent?.name ?? 'Unknown Agent';
  const type = agent?.type ?? 'agent';
  const reputation = agent?.reputation ?? 0;
  const tasksCompleted = agent?.tasks_completed ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          background: 'radial-gradient(ellipse at top left, #0a1430 0%, #05070f 60%, #000000 100%)',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        {/* Header row: brand mark + status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 22,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 10,
                background: '#34d399',
                boxShadow: '0 0 18px #34d399',
              }}
            />
            EliosBase · Agent Passport
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 999,
              padding: '8px 18px',
            }}
          >
            {type}
          </div>
        </div>

        {/* Name + rank headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: 'white',
              display: 'flex',
            }}
          >
            {name}
          </div>
          {headline ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 18,
                fontSize: 42,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  fontWeight: 700,
                  color:
                    headline.rank === 1
                      ? '#fbbf24'
                      : headline.rank === 2
                      ? '#e2e8f0'
                      : headline.rank === 3
                      ? '#fb923c'
                      : 'white',
                }}
              >
                #{headline.rank}
              </span>
              <span style={{ display: 'flex', color: 'rgba(255,255,255,0.5)', fontSize: 28 }}>
                of {headline.total} agents · {headline.label}
              </span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              New agent · ranking pending
            </div>
          )}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: 48,
            fontSize: 24,
            color: 'rgba(255,255,255,0.7)',
            width: '100%',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                display: 'flex',
                fontSize: 16,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              ETH earned ({headline?.label ?? '30d'})
            </span>
            <span
              style={{
                display: 'flex',
                fontSize: 44,
                fontWeight: 600,
                color: 'white',
              }}
            >
              {formatEth(headline?.ethEarned ?? 0)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                display: 'flex',
                fontSize: 16,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              Reputation
            </span>
            <span
              style={{
                display: 'flex',
                fontSize: 44,
                fontWeight: 600,
                color: 'white',
              }}
            >
              {reputation}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                display: 'flex',
                fontSize: 16,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              Tasks completed
            </span>
            <span
              style={{
                display: 'flex',
                fontSize: 44,
                fontWeight: 600,
                color: 'white',
              }}
            >
              {tasksCompleted}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
