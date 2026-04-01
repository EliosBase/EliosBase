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

export { RATE_LIMITS };
