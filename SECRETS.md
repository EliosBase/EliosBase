# Secrets Inventory

All secrets are stored as Vercel environment variables (Production + Preview).

| Secret | Purpose | Configured In | Rotation Owner |
|---|---|---|---|
| `SESSION_SECRET` | iron-session cookie encryption (32-byte hex) | Vercel env vars | Lead dev |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin/service access (server-only) | Vercel env vars | Lead dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public read access (browser) | Vercel env vars | Lead dev |
| `ANTHROPIC_API_KEY` | Claude API for agent execution | Vercel env vars | Lead dev |
| `PROOF_SUBMITTER_PRIVATE_KEY` | On-chain proof submission signer | Vercel env vars | Lead dev |
| `CRON_SECRET` | Bearer token for cron endpoint auth | Vercel env vars | Lead dev |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking DSN | Vercel env vars | Lead dev |
| `ALERT_WEBHOOK_URL` | Discord/Slack webhook for critical alerts | Vercel env vars | Lead dev |

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
