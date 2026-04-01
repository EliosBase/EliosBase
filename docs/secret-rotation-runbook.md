# Secret Rotation Runbook

## Rotation Schedule

| Secret | Rotation Cadence | Owner |
|--------|-----------------|-------|
| `SESSION_SECRET` | Every 90 days | Platform admin |
| `CRON_SECRET` | Every 90 days | Platform admin |
| `PROOF_SUBMITTER_PRIVATE_KEY` | Every 180 days or on compromise | Platform admin |
| `SAFE_POLICY_SIGNER_PRIVATE_KEY` | Every 180 days or on compromise | Platform admin |
| `ANTHROPIC_API_KEY` | Every 90 days | Platform admin |
| `SUPABASE_SERVICE_ROLE_KEY` | On compromise only | Platform admin |
| `UPSTASH_REDIS_REST_TOKEN` | Every 90 days | Platform admin |
| `SENTRY_AUTH_TOKEN` | Every 90 days | Platform admin |

## Rotation Procedures

### SESSION_SECRET

1. Generate new secret: `openssl rand -hex 32`
2. Update in Vercel: Project Settings > Environment Variables
3. Redeploy to pick up new value
4. **Note:** Existing sessions will be invalidated. Users will need to re-authenticate.

### CRON_SECRET

1. Generate new secret: `openssl rand -hex 32`
2. Update in Vercel environment variables
3. Update in GitHub Secrets (`SMOKE_CRON_SECRET`) for smoke tests
4. Redeploy

### PROOF_SUBMITTER_PRIVATE_KEY

1. Generate new keypair
2. Fund the new address with enough ETH for gas (~0.05 ETH recommended)
3. Update in Vercel environment variables
4. Redeploy
5. Monitor `/api/cron/check-signer-balance` to confirm new signer is active
6. **Warning:** Pending proofs submitted by the old key will still verify on-chain

### ANTHROPIC_API_KEY

1. Generate new API key at console.anthropic.com
2. Update in Vercel environment variables
3. Redeploy
4. Revoke old key in Anthropic console after confirming new key works

### UPSTASH_REDIS_REST_TOKEN

1. Rotate token in Upstash console
2. Update `UPSTASH_REDIS_REST_TOKEN` in Vercel
3. Redeploy
4. **Note:** Rate limit counters will reset

## Emergency: Compromised Secret

1. **Immediately** rotate the compromised secret using steps above
2. Trigger emergency redeploy: `vercel --prod`
3. Check audit log for unauthorized actions during exposure window
4. File incident report
5. If `PROOF_SUBMITTER_PRIVATE_KEY` was compromised:
   - Transfer remaining ETH from old signer to a safe address
   - Review recent on-chain proof submissions for anomalies
6. Notify team via alert webhook
