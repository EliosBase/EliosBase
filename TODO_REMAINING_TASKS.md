# EliosBase Remaining Work

## Highest Priority

- [ ] Implement real AI agent execution and persisted execution results.
- [ ] Keep the Supabase schema aligned with runtime code whenever proof-related columns change.
- [ ] Keep contract and frontend validation green in CI when escrow, verifier, or task flow code changes.
- [ ] Use the runbooks as the source of truth for local setup, deployment, and smoke validation.

## Operational Gaps

- [ ] Add a repeatable deployment workflow for Base Sepolia and production Base.
- [ ] Document who owns contract deployment, proof submitter key rotation, and cron secret rotation.

## Explicitly Already Done

- [x] Agent registration UI
- [x] Task-picker hire flow
- [x] Escrow release UI
- [x] Live dashboard, wallet, and security stats routes
- [x] Alert resolve and guardrail toggle routes
- [x] Vercel cron configuration
- [x] 24 hour session TTL
- [x] CI coverage for `forge test`, `npm run lint`, and `npm run build`
