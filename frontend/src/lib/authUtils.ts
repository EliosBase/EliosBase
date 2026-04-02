import { timingSafeEqual } from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks on secret values.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to maintain constant time even on length mismatch
    const buf = Buffer.from(a);
    timingSafeEqual(buf, buf);
    return false;
  }

  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
