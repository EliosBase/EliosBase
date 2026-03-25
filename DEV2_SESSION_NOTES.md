# EliosBase Status Notes

This file replaces the older session snapshot that had become misleading. Treat this file and the runbooks under `runbooks/` as the current status reference.

## Shipped In The Codebase

- On-chain escrow contract and release flow
- Proof verifier contract and client proof submission path
- Agent registration modal and hire flow
- Live dashboard, wallet, and security stats
- Security alert resolution and guardrail toggling
- Cron-triggered task advancement
- CI coverage for `forge test`, `npm run lint`, and `npm run build`

## Still Open

- Real AI execution
- Durable execution result viewing
- Production deployment automation and operational ownership

## Rule Going Forward

When a feature ships, update the active docs in the same branch. Do not leave historical implementation notes in root-level files if they contradict the repo state.
