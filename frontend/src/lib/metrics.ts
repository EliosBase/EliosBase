/**
 * Lightweight structured metrics logger.
 * Writes JSON to stdout — Vercel auto-captures these in log drain.
 */
export function logMetric(name: string, value: number, tags?: Record<string, string>) {
  console.log(JSON.stringify({ _metric: true, name, value, tags, ts: Date.now() }));
}
