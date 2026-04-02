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

const RUNTIME_ENV_ALIASES = {
  UPSTASH_REDIS_REST_URL: ['KV_REST_API_URL'],
  UPSTASH_REDIS_REST_TOKEN: ['KV_REST_API_TOKEN'],
  NEXT_PUBLIC_REOWN_PROJECT_ID: ['NEXT_PUBLIC_PROJECT_ID'],
} as const;

const PUBLIC_RUNTIME_ENV = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_BASE_CHAIN_ID: process.env.NEXT_PUBLIC_BASE_CHAIN_ID,
  NEXT_PUBLIC_ESCROW_ADDRESS: process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
  NEXT_PUBLIC_VERIFIER_ADDRESS: process.env.NEXT_PUBLIC_VERIFIER_ADDRESS,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_FRAMES_BASE_URL: process.env.NEXT_PUBLIC_FRAMES_BASE_URL,
  NEXT_PUBLIC_FC_CAST_ENABLED: process.env.NEXT_PUBLIC_FC_CAST_ENABLED,
  NEXT_PUBLIC_FC_FRAMES_ENABLED: process.env.NEXT_PUBLIC_FC_FRAMES_ENABLED,
  NEXT_PUBLIC_FC_AUTH_ENABLED: process.env.NEXT_PUBLIC_FC_AUTH_ENABLED,
  NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
  NEXT_PUBLIC_PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID,
} as const;

const SAFE7579_DEFAULT_RUNTIME_ENV = {
  SAFE7579_ADAPTER_ADDRESS: '0x7579f2ad53b01c3d8779fe17928e0d48885b0003',
  SAFE7579_OWNER_VALIDATOR_ADDRESS: '0x000000000013fdB5234E4E3162a810F54d9f7E98',
  SAFE7579_SMART_SESSIONS_ADDRESS: '0x00000000008bDABA73cD9815d79069c247Eb4bDA',
  SAFE7579_COMPATIBILITY_FALLBACK_ADDRESS: '0x000000000052e9685932845660777DF43C2dC496',
} as const;

const SIGNER_ENV = [
  'SAFE_POLICY_SIGNER_PRIVATE_KEY',
  'PROOF_SUBMITTER_PRIVATE_KEY',
] as const;

function readConfiguredEnv(name: string) {
  const configured =
    readEnv(PUBLIC_RUNTIME_ENV[name as keyof typeof PUBLIC_RUNTIME_ENV]) ??
    readEnv(process.env[name]) ??
    RUNTIME_ENV_ALIASES[name as keyof typeof RUNTIME_ENV_ALIASES]
      ?.map((alias) => readEnv(process.env[alias]))
      .find(Boolean);

  return configured ?? SAFE7579_DEFAULT_RUNTIME_ENV[name as keyof typeof SAFE7579_DEFAULT_RUNTIME_ENV];
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

export function getConfiguredSiteUrl() {
  return readConfiguredEnv('NEXT_PUBLIC_SITE_URL');
}

export function getConfiguredReownProjectId() {
  return readConfiguredEnv('NEXT_PUBLIC_REOWN_PROJECT_ID');
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
