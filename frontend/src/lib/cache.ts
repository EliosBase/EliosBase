import { Redis } from '@upstash/redis';
import { readEnv } from '@/lib/env';

/**
 * Tiny JSON cache on top of the same Upstash Redis instance used by
 * `rateLimit.ts`. Intentionally simple — it's used for low-cardinality,
 * server-computed aggregates (leaderboard, per-agent earnings chart) where
 * the underlying query costs more than a Redis round-trip but the data is
 * okay to be a minute stale.
 *
 * Design goals:
 *  - Fail open. Any Redis error (misconfigured, offline, quota exceeded)
 *    must return `null` from reads and silently swallow writes so the caller
 *    falls through to the source of truth. This follows the same convention
 *    as `edgeRateLimit` in rateLimit.ts.
 *  - Zero deps on request context. Safe to call from anywhere in a route
 *    handler, including the edge.
 *  - Namespaced. Every key is prefixed with `eliosbase:cache:` so our keys
 *    never collide with the ratelimit library (which uses `eliosbase:` +
 *    its own namespaces).
 */

let redisClient: Redis | null | undefined;

function readRedisEnv(...names: string[]) {
  for (const name of names) {
    const value = readEnv(process.env[name]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function getRedisClient(): Redis | null {
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

function keyFor(namespace: string, identifier: string): string {
  return `eliosbase:cache:${namespace}:${identifier}`;
}

/**
 * Read a cached JSON value. Returns `null` if:
 *   - Redis is not configured,
 *   - the key doesn't exist,
 *   - the Redis call throws,
 *   - the stored payload fails to deserialize.
 */
export async function readJsonCache<T>(
  namespace: string,
  identifier: string,
): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    // Upstash auto-deserializes JSON payloads, so this is already typed.
    const value = await redis.get<T>(keyFor(namespace, identifier));
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a JSON value with TTL. Silently swallows errors — the caller should
 * already have the computed value in memory and proceed regardless of
 * whether the write landed.
 */
export async function writeJsonCache<T>(
  namespace: string,
  identifier: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(keyFor(namespace, identifier), value, { ex: ttlSeconds });
  } catch {
    // Fall through — cache write failures must never break the request path.
  }
}

/**
 * Convenience wrapper: return the cached value if present, otherwise run
 * `compute()`, cache the result with the given TTL, and return it. Errors
 * from the cache layer are ignored. Errors from `compute()` propagate, so
 * the caller can decide whether the request itself should fail.
 */
export async function withJsonCache<T>(
  namespace: string,
  identifier: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = await readJsonCache<T>(namespace, identifier);
  if (cached !== null) {
    return cached;
  }

  const value = await compute();
  await writeJsonCache(namespace, identifier, value, ttlSeconds);
  return value;
}
