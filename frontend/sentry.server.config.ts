import * as Sentry from '@sentry/nextjs';
import { getSentryRuntimeConfig } from './src/lib/sentryConfig';

const sentry = getSentryRuntimeConfig();

Sentry.init({
  dsn: sentry.dsn,
  tracesSampleRate: 0.1,
  enabled: sentry.enabled,
  environment: sentry.environment,
  release: sentry.release,
});
