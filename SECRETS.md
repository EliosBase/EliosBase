# Secrets Inventory

Runtime secrets are stored in Vercel environment variables.
Production and preview should use separate values for stateful systems whenever preview writes are enabled.
CI-only smoke secrets are stored in GitHub Actions repository secrets.

| Secret | Purpose | Configured In | Rotation Owner |
|---|---|---|---|
| `SESSION_SECRET` | iron-session cookie encryption (32-byte hex) | Vercel env vars | Lead dev |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin/service access (server-only) | Vercel env vars | Lead dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public read access (browser) | Vercel env vars | Lead dev |
| `ANTHROPIC_API_KEY` | Claude API for agent execution | Vercel env vars | Lead dev |
| `PROOF_SUBMITTER_PRIVATE_KEY` | On-chain proof submission signer | Vercel env vars | Lead dev |
| `SAFE_POLICY_SIGNER_PRIVATE_KEY` | Safe policy execution signer | Vercel env vars | Lead dev |
| `CRON_SECRET` | Bearer token for cron endpoint auth | Vercel env vars | Lead dev |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL for application rate limiting | Vercel env vars | Lead dev |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token for application rate limiting | Vercel env vars | Lead dev |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking DSN | Vercel env vars | Lead dev |
| `SENTRY_AUTH_TOKEN` | Sentry source-map upload token | Vercel env vars | Lead dev |
| `SENTRY_ORG` | Sentry organization slug | Vercel env vars | Lead dev |
| `SENTRY_PROJECT` | Sentry project slug | Vercel env vars | Lead dev |
| `ALERT_WEBHOOK_URL` | Discord/Slack webhook for critical alerts | Vercel env vars | Lead dev |
| `SMOKE_SESSION_COOKIE` | Authenticated smoke-test session fallback | GitHub Actions secrets | Lead dev |
| `SMOKE_CRON_SECRET` | Live smoke authorization for cron endpoints | GitHub Actions secrets | Lead dev |
| `SMOKE_SIWE_PRIVATE_KEY` | Dedicated smoke wallet for live SIWE authentication | GitHub Actions secrets | Lead dev |
| `SMOKE_AGENT_ID` | Agent used for authenticated wallet read-only smoke checks | GitHub Actions secrets | Lead dev |
| `SMOKE_TASK_CREATE_BODY` | JSON payload for live task creation smoke | GitHub Actions secrets | Lead dev |
| `SMOKE_HIRE_BODY` | JSON payload for verified live hire smoke | GitHub Actions secrets | Lead dev |
| `SMOKE_TX_SYNC_BODY` | JSON payload for live transaction sync smoke | GitHub Actions secrets | Lead dev |
| `PREVIEW_X402_PRIVATE_KEY` | Preview-only funded wallet for manual x402 paid execution smoke | GitHub Actions secrets | Lead dev |
| `PREVIEW_X402_AGENT_ID` | Optional payable preview agent override for `preview-live-x402` | GitHub Actions secrets | Lead dev |
| `PREVIEW_X402_NETWORK` | Optional preview x402 network override | GitHub Actions vars | Lead dev |

## Preview Rules

- Do not point preview deployments at production Supabase, signer keys, or contract addresses once preview writes are enabled.
- On Vercel, store shared preview runtime config in the standard `preview` environment unless a branch needs an explicit override.
- Do not hard-code `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_FRAMES_BASE_URL` for preview branches. The app derives preview origins from `NEXT_PUBLIC_VERCEL_BRANCH_URL`.
- `preview-smoke` uses GitHub repository secrets `VERCEL_TOKEN` and `VERCEL_PROTECTION_BYPASS` to locate and validate the PR preview deployment.
- `preview-live-x402` uses `PREVIEW_X402_PRIVATE_KEY` and optionally `PREVIEW_X402_AGENT_ID` to run one real paid preview execution before merge.

## Rotation Procedure

1. Generate new secret value
2. Update in Vercel dashboard (Settings > Environment Variables)
3. Redeploy to pick up the new value
4. Verify the deployment works (check smoke tests)
5. Revoke the old value where applicable (Supabase dashboard, Anthropic console)

## Signer Key Special Handling

The `PROOF_SUBMITTER_PRIVATE_KEY` controls an on-chain wallet. If compromised:
1. Immediately rotate the key in Vercel
2. Transfer remaining funds from the old signer address
3. Fund the new signer address with ETH for gas
4. Redeploy and verify proof submission works

The signer balance is monitored every 6 hours via `/api/cron/check-signer-balance`.
A critical alert fires when balance drops below `SIGNER_MIN_BALANCE_ETH` (default: 0.01 ETH).
