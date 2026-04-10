import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { readEnv } from '@/lib/env';
import { isProductionRuntime } from '@/lib/runtimeConfig';

type RateLimitPolicy = {
  namespace: string;
  limit: number;
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`;
};

const RATE_LIMITS = {
  // Per-endpoint business-logic limiters (called from individual route handlers).
  authNonce: { namespace: 'auth:nonce', limit: 10, window: '10 m' },
  authVerify: { namespace: 'auth:verify', limit: 20, window: '10 m' },
  taskCreate: { namespace: 'tasks:create', limit: 20, window: '10 m' },
  agentRegister: { namespace: 'agents:register', limit: 10, window: '10 m' },
  hireAgent: { namespace: 'agents:hire', limit: 20, window: '10 m' },
  transactionSyncRead: { namespace: 'transactions:sync:read', limit: 60, window: '10 m' },
  transactionSyncWrite: { namespace: 'transactions:sync:write', limit: 30, window: '10 m' },
  walletMutation: { namespace: 'wallet:mutation', limit: 20, window: '10 m' },
  walletTransferRead: { namespace: 'wallet:transfer:read', limit: 60, window: '10 m' },
  walletTransferMutation: { namespace: 'wallet:transfer:mutation', limit: 20, window: '10 m' },
  framesInteract: { namespace: 'frames:interact', limit: 30, window: '10 m' },
  framesTx: { namespace: 'frames:tx', limit: 10, window: '10 m' },
  castPublish: { namespace: 'cast:publish', limit: 10, window: '10 m' },
  signerCreate: { namespace: 'signer:create', limit: 5, window: '1 h' },

  // Global edge-layer safety-net. Applied by middleware.ts against every
  // /api/* request keyed by client IP. This is a coarse DDoS cap — a single
  // IP cannot exceed ~10 req/sec averaged across any route. Per-route
  // limits above are stricter and still apply on top.
  apiGlobal: { namespace: 'api:global', limit: 600, window: '1 m' },

  // Admin mutations — any POST/PUT/PATCH/DELETE on /api/admin/*. Keyed by
  // admin session identifier (or IP fallback). Prevents a compromised admin
  // session from running away with automated mutations.
  adminMutation: { namespace: 'admin:mutation', limit: 30, window: '1 m' },
} satisfies Record<string, RateLimitPolicy>;

let redisClient: Redis | null | undefined;
const ratelimiters = new Map<string, Ratelimit>();

function readRedisEnv(...names: string[]) {
  for (const name of names) {
    const value = readEnv(process.env[name]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getRedisClient() {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = readRedisEnv('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL');
  const token = readRedisEnv('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN');
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getRatelimiter(policy: RateLimitPolicy) {
  const existing = ratelimiters.get(policy.namespace);
  if (existing) {
    return existing;
  }

  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const ratelimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    prefix: `eliosbase:${policy.namespace}`,
  });
  ratelimiters.set(policy.namespace, ratelimiter);
  return ratelimiter;
}

function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'anonymous';
  }

  return req.headers.get('x-real-ip') ?? 'anonymous';
}

function configurationError() {
  return NextResponse.json(
    { error: 'Rate limiting is not configured' },
    { status: 500 },
  );
}

export async function enforceRateLimit(
  req: NextRequest,
  policy: RateLimitPolicy,
  identifier = getRequestIp(req),
) {
  const ratelimiter = getRatelimiter(policy);
  if (!ratelimiter) {
    return isProductionRuntime() ? configurationError() : null;
  }

  const result = await ratelimiter.limit(identifier);
  void result.pending.catch(() => undefined);

  if (result.success) {
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  const response = NextResponse.json(
    {
      error: 'Rate limit exceeded',
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter,
    },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(retryAfter));
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.reset));
  return response;
}

/**
 * Edge-layer rate limiter for use from `middleware.ts`.
 *
 * Differences from `enforceRateLimit`:
 * - Returns `null` (pass-through) when Redis is not configured, regardless
 *   of environment. The middleware runs on every request and must never
 *   hard-fail the whole site just because the rate-limit backend is down.
 *   The per-handler `enforceRateLimit` helper still errors in production,
 *   so individual sensitive routes remain protected.
 * - Accepts a raw identifier string (middleware builds its own keys — e.g.
 *   `ip:203.0.113.5` or `admin:0xabc...` — rather than passing a NextRequest).
 * - On success returns `null`; on limit returns a 429 NextResponse with
 *   standard X-RateLimit-* headers and Retry-After.
 */
export async function edgeRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
): Promise<NextResponse | null> {
  const ratelimiter = getRatelimiter(policy);
  if (!ratelimiter) {
    return null;
  }

  let result: Awaited<ReturnType<typeof ratelimiter.limit>>;
  try {
    result = await ratelimiter.limit(identifier);
  } catch {
    // Redis failure must not take the site down. Fail open and let the
    // request proceed — per-handler limiters remain as a second line.
    return null;
  }

  void result.pending.catch(() => undefined);

  if (result.success) {
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  const response = NextResponse.json(
    {
      error: 'Rate limit exceeded',
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter,
    },
    { status: 429 },
  );
  response.headers.set('Retry-After', String(retryAfter));
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.reset));
  return response;
}

/**
 * Extract a best-effort client IP from a request. Prefers the left-most
 * x-forwarded-for entry (set by Vercel's edge), falls back to x-real-ip,
 * then the literal string `anonymous`. Exported so middleware.ts can build
 * its own identifier keys.
 */
export function extractRequestIp(req: NextRequest): string {
  return getRequestIp(req);
}

export { RATE_LIMITS };
