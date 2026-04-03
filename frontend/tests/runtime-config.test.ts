import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredFramesBaseUrl,
  getConfiguredReownProjectId,
  getConfiguredSiteUrl,
  getRuntimeConfigurationStatus,
} from '@/lib/runtimeConfig';

const originalEnv = { ...process.env };

function configureRuntimeEnv(overrides: Record<string, string | undefined> = {}) {
  process.env = {
    ...originalEnv,
    SESSION_SECRET: 'session-secret',
    NEXT_PUBLIC_SITE_URL: 'https://eliosbase.net',
    CRON_SECRET: 'cron-secret',
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    UPSTASH_REDIS_REST_URL: 'https://upstash.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
    BASE_RPC_URL: 'https://base.example.rpc',
    NEXT_PUBLIC_ESCROW_ADDRESS: '0xescrow',
    NEXT_PUBLIC_VERIFIER_ADDRESS: '0xverifier',
    AGENT_SESSION_ENCRYPTION_KEY: 'encryption-key',
    SAFE7579_POLICY_MANAGER_ADDRESS: '0xpolicy',
    SAFE7579_GUARD_ADDRESS: '0xguard',
    SAFE7579_HOOK_ADDRESS: '0xhook',
    SAFE7579_ADAPTER_ADDRESS: '0xadapter',
    SAFE7579_OWNER_VALIDATOR_ADDRESS: '0xvalidator',
    SAFE7579_SMART_SESSIONS_ADDRESS: '0xsessions',
    SAFE7579_COMPATIBILITY_FALLBACK_ADDRESS: '0xfallback',
    NEXT_PUBLIC_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    SENTRY_AUTH_TOKEN: 'sentry-auth-token',
    SENTRY_ORG: 'eliosbase',
    SENTRY_PROJECT: 'frontend',
    SAFE_POLICY_SIGNER_PRIVATE_KEY: '0x1234',
    PROOF_SUBMITTER_PRIVATE_KEY: undefined,
    NEXT_PUBLIC_VERCEL_BRANCH_URL: undefined,
    NEXT_PUBLIC_VERCEL_URL: undefined,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: undefined,
    ...overrides,
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('getRuntimeConfigurationStatus', () => {
  it('requires Upstash rate-limit configuration for a ready runtime', () => {
    configureRuntimeEnv({ UPSTASH_REDIS_REST_TOKEN: undefined });

    const status = getRuntimeConfigurationStatus();

    expect(status.configured).toBe(false);
    expect(status.missing).toContain('UPSTASH_REDIS_REST_TOKEN');
  });

  it('accepts either signer secret as satisfying the signer requirement', () => {
    configureRuntimeEnv({
      SAFE_POLICY_SIGNER_PRIVATE_KEY: undefined,
      PROOF_SUBMITTER_PRIVATE_KEY: '0xabcd',
    });

    const status = getRuntimeConfigurationStatus();

    expect(status.configured).toBe(true);
    expect(status.missing).not.toContain('SIGNER_KEY');
  });

  it('accepts Vercel KV environment aliases for Upstash rate limiting', () => {
    configureRuntimeEnv({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      KV_REST_API_URL: 'https://kv.example.com',
      KV_REST_API_TOKEN: 'kv-token',
    });

    const status = getRuntimeConfigurationStatus();

    expect(status.configured).toBe(true);
    expect(status.missing).not.toContain('UPSTASH_REDIS_REST_URL');
    expect(status.missing).not.toContain('UPSTASH_REDIS_REST_TOKEN');
  });

  it('treats built-in Safe7579 module addresses as configured defaults', () => {
    configureRuntimeEnv({
      SAFE7579_ADAPTER_ADDRESS: undefined,
      SAFE7579_OWNER_VALIDATOR_ADDRESS: undefined,
      SAFE7579_SMART_SESSIONS_ADDRESS: undefined,
      SAFE7579_COMPATIBILITY_FALLBACK_ADDRESS: undefined,
    });

    const status = getRuntimeConfigurationStatus();

    expect(status.configured).toBe(true);
    expect(status.missing).not.toContain('SAFE7579_ADAPTER_ADDRESS');
    expect(status.missing).not.toContain('SAFE7579_OWNER_VALIDATOR_ADDRESS');
    expect(status.missing).not.toContain('SAFE7579_SMART_SESSIONS_ADDRESS');
    expect(status.missing).not.toContain('SAFE7579_COMPATIBILITY_FALLBACK_ADDRESS');
  });

  it('accepts NEXT_PUBLIC_PROJECT_ID as an alias for Reown AppKit', () => {
    configureRuntimeEnv({
      NEXT_PUBLIC_REOWN_PROJECT_ID: undefined,
      NEXT_PUBLIC_PROJECT_ID: 'reown-project-id',
    });

    expect(getConfiguredReownProjectId()).toBe('reown-project-id');
  });

  it('keeps the Reown alias available after client-style env inlining', async () => {
    configureRuntimeEnv({
      NEXT_PUBLIC_REOWN_PROJECT_ID: undefined,
      NEXT_PUBLIC_PROJECT_ID: 'reown-project-id',
    });

    vi.resetModules();

    const runtimeConfig = await import('@/lib/runtimeConfig');

    delete process.env.NEXT_PUBLIC_PROJECT_ID;

    expect(runtimeConfig.getConfiguredReownProjectId()).toBe('reown-project-id');
  });

  it('derives preview URLs from the Vercel branch URL when the site URL is unset', () => {
    configureRuntimeEnv({
      NEXT_PUBLIC_SITE_URL: undefined,
      NEXT_PUBLIC_FRAMES_BASE_URL: undefined,
      NEXT_PUBLIC_VERCEL_BRANCH_URL: 'frontend-git-feature-auth-preview.vercel.app',
    });

    expect(getConfiguredSiteUrl()).toBe('https://frontend-git-feature-auth-preview.vercel.app');
    expect(getConfiguredFramesBaseUrl()).toBe('https://frontend-git-feature-auth-preview.vercel.app');
  });
});
