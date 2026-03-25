# Repo Gap Remediation

## Summary
- Reconcile schema/code drift, replace stale backlog docs with current truth, add missing env and deployment/runbook coverage, and add minimum automated contract verification.

## Already Done; Do Not Re-Implement
- Agent registration UI, task-picker hire flow, `/api/agents/[id]/hire`, release UI and `/api/tasks/[id]/release`, live `/api/stats`, live `/api/security/stats`, alert resolve route, guardrail toggle route, wallet stats route, Vercel cron config, and 24h session expiry.

## Key Changes
- Reconcile Supabase schema with runtime code by adding `zk_commitment` and `zk_verify_tx_hash` to `tasks` in `supabase/seed.sql` and the live DB migration path; verify the final schema matches `frontend/src/lib/types/database.ts` and the task-advance route.
- Add a root `.env.example` with the current required variables: Supabase URL/keys, `SESSION_SECRET`, `NEXT_PUBLIC_CHAIN`, `BASE_RPC_URL`, `NEXT_PUBLIC_ESCROW_ADDRESS`, `NEXT_PUBLIC_VERIFIER_ADDRESS`, `PROOF_SUBMITTER_PRIVATE_KEY`, `CRON_SECRET`, and `NEXT_PUBLIC_SITE_URL`. Note that the AI-execution branch adds `ANTHROPIC_API_KEY`.
- Rewrite the stale project docs so they reflect the current repo state and real backlog: `EliosBase_Remaining_Tasks.md`, `TODO_REMAINING_TASKS.md`, `DEV2_SESSION_NOTES.md`, `backend.md`, and `frontend/README.md`.
- In those docs, explicitly call out the actual high-priority gaps: schema drift, missing automated tests, incomplete deployment/runbook documentation, and missing real AI execution.
- Add Foundry tests for `contracts/src/EliosEscrow.sol` and `contracts/src/EliosProofVerifier.sol`.
- Add a concise runbook covering local app boot, Base/Base Sepolia env setup, contract deployment order, proof submitter setup, cron verification, and manual end-to-end smoke steps.
- Leave `sparklineData` as a UI fallback only; do not reopen already-solved live-stats work.

## Tests and Validation
- Run `forge test`.
- Run `npm run lint` and `npm run build` in `frontend`.
- Manual smoke: sign in, register an agent, submit a task, hire the agent, observe task advancement, verify proof submission, release funds, resolve an alert, and toggle a guardrail.

## Assumptions
- This branch excludes Anthropic integration and task-result UI.
- The docs should become the current source of truth for repo status and setup.
