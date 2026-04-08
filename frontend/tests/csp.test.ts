import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, getFrameAncestors, getScriptSources } from '@/lib/csp';

describe('content security policy', () => {
  it('uses explicit Farcaster frame ancestors by default', () => {
    expect(getFrameAncestors(undefined)).toEqual([
      "'self'",
      'https://warpcast.com',
      'https://*.warpcast.com',
      'https://farcaster.xyz',
      'https://*.farcaster.xyz',
      'https://base.dev',
      'https://*.base.dev',
      'https://base.org',
      'https://*.base.org',
      'https://base.app',
      'https://*.base.app',
    ]);
  });

  it('does not allow unsafe-eval in default scripts', () => {
    expect(getScriptSources(undefined)).not.toContain("'unsafe-eval'");
  });

  it('builds a CSP without wildcard frame ancestors', () => {
    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("frame-ancestors 'self' https://warpcast.com https://*.warpcast.com https://farcaster.xyz https://*.farcaster.xyz https://base.dev https://*.base.dev https://base.org https://*.base.org https://base.app https://*.base.app");
    expect(csp).not.toContain('frame-ancestors *');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain('https://cdn.jsdelivr.net');
    expect(csp).toContain('https://esm.sh');
  });
});
