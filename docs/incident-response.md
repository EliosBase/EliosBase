# Incident Response Playbook

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 - Critical | Service down, funds at risk | 15 minutes | Escrow exploit, auth bypass, mainnet outage |
| P1 - High | Major feature broken, degraded service | 1 hour | Task advancement stuck, proof submission failing |
| P2 - Medium | Minor feature broken, workaround exists | 4 hours | UI bug, non-critical API error, stale data |
| P3 - Low | Cosmetic, no user impact | Next business day | Typo, logging noise, minor styling issue |

## Incident Response Steps

### 1. Detect

- Sentry alerts (automatic)
- Webhook alerts to Discord/Slack (automatic, via `/api/cron/alert-check`)
- User reports
- Smoke test failures (via `release-gate.yml`)

### 2. Triage

- Assign severity level
- Identify affected components (frontend, API, contracts, database)
- Check Sentry for error details and frequency
- Check Vercel logs for API route errors

### 3. Communicate

- P0/P1: Post in incident channel immediately
- Update status page if available
- Notify affected users if data/funds are impacted

### 4. Mitigate

**Frontend/API Issues:**
- Roll back via Vercel dashboard (Deployments > ... > Promote to Production)
- Or: `vercel rollback` via CLI

**Database Issues:**
- Check Supabase dashboard for connection issues
- Run down migration if schema change caused the issue
- Restore from Supabase point-in-time recovery if data corruption

**Contract Issues:**
- Contracts are immutable once deployed
- If escrow is compromised: pause operations, communicate to users
- Use owner functions to refund/dispute affected escrows
- Deploy patched contract and update `NEXT_PUBLIC_ESCROW_ADDRESS`

**AI Execution Issues:**
- Check Anthropic API status page
- If rate limited: reduce cron frequency for `/api/cron/advance-tasks`
- If key compromised: rotate `ANTHROPIC_API_KEY` immediately

### 5. Resolve

- Deploy fix
- Verify via smoke tests
- Confirm Sentry error rate returns to baseline
- Update incident report

### 6. Post-Mortem

- Write incident report within 48 hours
- Include: timeline, root cause, impact, remediation steps
- Identify preventive measures
- Update runbooks if procedures were missing
- File follow-up tasks in GitHub issues
