import { readEnv } from '@/lib/env';

export type RuntimeCheck = {
  name: string;
  configured: boolean;
};

const REQUIRED_RUNTIME_ENV = [
  'SESSION_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'CRON_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'BASE_RPC_URL',
  'NEXT_PUBLIC_ESCROW_ADDRESS',
  'NEXT_PUBLIC_VERIFIER_ADDRESS',
  'AGENT_SESSION_ENCRYPTION_KEY',
  'SAFE7579_POLICY_MANAGER_ADDRESS',
  'SAFE7579_GUARD_ADDRESS',
  'SAFE7579_HOOK_ADDRESS',
  'SAFE7579_ADAPTER_ADDRESS',
  'SAFE7579_OWNER_VALIDATOR_ADDRESS',
  'SAFE7579_SMART_SESSIONS_ADDRESS',
  'SAFE7579_COMPATIBILITY_FALLBACK_ADDRESS',
] as const;

const REQUIRED_SENTRY_ENV = [
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
] as const;

const SIGNER_ENV = [
  'SAFE_POLICY_SIGNER_PRIVATE_KEY',
  'PROOF_SUBMITTER_PRIVATE_KEY',
] as const;

function readConfiguredEnv(name: string) {
  return readEnv(process.env[name]);
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

export function getConfiguredSiteUrl() {
  return readConfiguredEnv('NEXT_PUBLIC_SITE_URL');
}

export function requireConfiguredSiteUrl() {
  const siteUrl = getConfiguredSiteUrl();
  if (!siteUrl) {
    throw new Error('NEXT_PUBLIC_SITE_URL not configured');
  }

  return siteUrl;
}

export function getConfiguredCronSecret() {
  return readConfiguredEnv('CRON_SECRET');
}

export function requireConfiguredCronSecret() {
  const cronSecret = getConfiguredCronSecret();
  if (!cronSecret) {
    throw new Error('CRON_SECRET not configured');
  }

  return cronSecret;
}

export function getRequiredRuntimeChecks() {
  const checks: RuntimeCheck[] = REQUIRED_RUNTIME_ENV.map((name) => ({
    name,
    configured: Boolean(readConfiguredEnv(name)),
  }));

  checks.push({
    name: 'SIGNER_KEY',
    configured: SIGNER_ENV.some((name) => Boolean(readConfiguredEnv(name))),
  });

  checks.push(
    ...REQUIRED_SENTRY_ENV.map((name) => ({
      name,
      configured: Boolean(readConfiguredEnv(name)),
    })),
  );

  return checks;
}

export function getRuntimeConfigurationStatus() {
  const checks = getRequiredRuntimeChecks();
  const missing = checks.filter((check) => !check.configured).map((check) => check.name);

  return {
    checks,
    missing,
    configured: missing.length === 0,
  };
}
