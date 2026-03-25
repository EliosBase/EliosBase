# Deployment Runbook

## Order Of Operations

1. Apply the latest Supabase schema changes.
2. Deploy `EliosEscrow.sol`.
3. Deploy `EliosProofVerifier.sol` with the Groth16 verifier address.
4. Publish circuit artifacts to `frontend/public/circuits/`.
5. Set runtime environment variables in the hosting platform.
6. Deploy the frontend.
7. Verify cron auth and the `/api/cron/advance-tasks` schedule.

## Required Checks Before Deploy

- `forge test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- Manual smoke checklist in `runbooks/manual-smoke-checklist.md`

## Secrets To Set

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_CHAIN`
- `BASE_RPC_URL`
- `NEXT_PUBLIC_ESCROW_ADDRESS`
- `NEXT_PUBLIC_VERIFIER_ADDRESS`
- `PROOF_SUBMITTER_PRIVATE_KEY`
- `CRON_SECRET`

## Post-Deploy Checks

- Task submission works.
- Hire flow writes an escrow lock transaction.
- Task advancement still progresses.
- Proof completion writes proof metadata.
- Escrow release works for the submitter.
- Security alert resolution and guardrail toggling still work.
