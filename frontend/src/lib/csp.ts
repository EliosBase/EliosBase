import { readEnv } from './env';

const DEFAULT_FRAME_ANCESTORS = [
  "'self'",
  'https://warpcast.com',
  'https://*.warpcast.com',
  'https://farcaster.xyz',
  'https://*.farcaster.xyz',
] as const;

const DEFAULT_SCRIPT_SOURCES = [
  "'self'",
  "'unsafe-inline'",
  'blob:',
  'https://esm.sh',
  'https://cdn.jsdelivr.net',
] as const;

export function parseCspSourceList(value: string | undefined, fallback: readonly string[]) {
  const normalized = readEnv(value);
  if (!normalized) {
    return [...fallback];
  }

  return normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getFrameAncestors(value?: string) {
  return parseCspSourceList(value, DEFAULT_FRAME_ANCESTORS);
}

export function getScriptSources(value?: string) {
  return parseCspSourceList(value, DEFAULT_SCRIPT_SOURCES);
}

export function buildContentSecurityPolicy(options: {
  frameAncestors?: string[];
  scriptSources?: string[];
} = {}) {
  const frameAncestors = options.frameAncestors ?? getFrameAncestors(process.env.CSP_FRAME_ANCESTORS);
  const scriptSources = options.scriptSources ?? getScriptSources(process.env.CSP_SCRIPT_SOURCES);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src ${scriptSources.join(' ')}`,
    "connect-src 'self' https: wss: https://relay.farcaster.xyz",
    "worker-src 'self' blob:",
    "frame-src 'self' https://warpcast.com https://*.warpcast.com https://relay.farcaster.xyz",
  ].join('; ');
}
