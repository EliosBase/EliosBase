import { describe, expect, it } from 'vitest';
import { getSentryRuntimeConfig } from '@/lib/sentryConfig';

describe('getSentryRuntimeConfig', () => {
  it('derives the release from the current deployment sha', () => {
    const config = getSentryRuntimeConfig({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      VERCEL_GIT_COMMIT_SHA: 'deadbeef',
      VERCEL_ENV: 'production',
    });

    expect(config.release).toBe('deadbeef');
    expect(config.environment).toBe('production');
    expect(config.enabled).toBe(true);
  });

  it('prefers an explicit SENTRY_RELEASE override', () => {
    const config = getSentryRuntimeConfig({
      NODE_ENV: 'test',
      NEXT_PUBLIC_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      SENTRY_RELEASE: 'frontend@1.2.3',
      VERCEL_GIT_COMMIT_SHA: 'deadbeef',
    });

    expect(config.release).toBe('frontend@1.2.3');
  });
});
