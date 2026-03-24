# EliosBase Remaining Work

## Highest Priority

- [ ] Implement real AI agent execution and persisted execution results.
- [ ] Keep the Supabase schema aligned with runtime code whenever proof-related columns change.
- [ ] Keep contract tests green in CI and extend them when escrow or verifier behavior changes.
- [ ] Use the new runbooks as the source of truth for local setup, deployment, and smoke validation.

## Operational Gaps

- [ ] Add a repeatable deployment workflow for Base Sepolia and production Base.
- [ ] Document who owns contract deployment, proof submitter key rotation, and cron secret rotation.
- [ ] Add CI coverage for `forge test`, `npm run lint`, and `npm run build`.

## Explicitly Already Done

- [x] Agent registration UI
- [x] Task-picker hire flow
- [x] Escrow release UI
- [x] Live dashboard, wallet, and security stats routes
- [x] Alert resolve and guardrail toggle routes
- [x] Vercel cron configuration
- [x] 24 hour session TTL
