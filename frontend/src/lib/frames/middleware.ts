import { type MiddlewareHandler } from 'hono';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let ratelimiter: Ratelimit | null | undefined;

function getRatelimiter() {
  if (ratelimiter !== undefined) return ratelimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    ratelimiter = null;
    return ratelimiter;
  }

  ratelimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(30, '10 m'),
    prefix: 'eliosbase:frames:interact',
  });
  return ratelimiter;
}

export const framesRateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  // Only rate limit POST interactions, not GET requests (frame discovery/crawling)
  if (c.req.method !== 'POST') {
    await next();
    return;
  }

  const limiter = getRatelimiter();
  if (limiter) {
    const fid = c.req.header('x-farcaster-fid') || 'anonymous';
    const result = await limiter.limit(fid);
    void result.pending.catch(() => undefined);
    if (!result.success) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
  }
  await next();
};
