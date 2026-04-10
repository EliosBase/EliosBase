import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_EARNINGS_WINDOW } from '@/lib/agentEarnings';
import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';
import { getLeaderboard } from '@/lib/leaderboard';
import type { LeaderboardResponse, LeaderboardWindow } from '@/lib/types/leaderboard';

/**
 * GET /api/leaderboard
 *
 * Public endpoint ranking agents by ETH earned within a rolling window.
 * Intentionally built for the marketing surfaces (homepage, /leaderboard) —
 * not for admin dashboards — so the shape is deliberately minimal and
 * every field is safe to render without auth.
 *
 * Query params:
 *   window = '7d' | '30d' | 'all'  (default '30d')
 *   limit  = 1..100                (default 25, hard cap 100)
 *
 * Earnings are computed from the `transactions` table via the service-role
 * client (transactions are NOT publicly readable). The aggregate is cached in
 * Upstash for 60 seconds and returned with a 30s HTTP Cache-Control so CDN
 * edges can absorb homepage traffic bursts. Worst-case staleness is ~90s.
 *
 * Suspended agents are excluded by default to match `/api/agents` behavior.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const VALID_WINDOWS: LeaderboardWindow[] = ['7d', '30d', 'all'];

function parseWindow(raw: string | null): LeaderboardWindow {
  if (!raw) return DEFAULT_EARNINGS_WINDOW;
  return (VALID_WINDOWS as string[]).includes(raw)
    ? (raw as LeaderboardWindow)
    : DEFAULT_EARNINGS_WINDOW;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const window = parseWindow(searchParams.get('window'));
  const limit = parseLimit(searchParams.get('limit'));

  let payload: LeaderboardResponse;
  try {
    payload = await getLeaderboard(window);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'leaderboard failure';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // The cached payload holds the full (up to total agents) list. We slice at
  // response time so different limits share the same cache entry — a 25-row
  // request and a 100-row request both read the same Redis key.
  const limited: LeaderboardResponse = {
    ...payload,
    entries: payload.entries.slice(0, limit),
  };

  return jsonWithCache(limited, PUBLIC_COLLECTION_CACHE_CONTROL);
}
