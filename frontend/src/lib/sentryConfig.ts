import { readEnv } from './env';

type SentryRuntimeConfig = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  release: string | undefined;
};

export function getSentryRuntimeConfig(env: NodeJS.ProcessEnv = process.env): SentryRuntimeConfig {
  const dsn = readEnv(env.NEXT_PUBLIC_SENTRY_DSN);
  const environment =
    readEnv(env.SENTRY_ENVIRONMENT)
    ?? readEnv(env.VERCEL_ENV)
    ?? readEnv(env.NODE_ENV)
    ?? 'development';
  const release =
    readEnv(env.SENTRY_RELEASE)
    ?? readEnv(env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA)
    ?? readEnv(env.VERCEL_GIT_COMMIT_SHA)
    ?? readEnv(env.GITHUB_SHA);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    release,
  };
}
