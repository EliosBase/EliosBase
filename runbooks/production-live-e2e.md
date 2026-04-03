# Production Live E2E

## Purpose

Use `production-live-e2e` for manual launch sign-off against `https://eliosbase.net`.

- `production-smoke` stays read-only and runs on every `main` deploy.
- `production-live-e2e` is the manual write-path check for real Base transactions and authenticated production mutations.

## Modes

- `core`
  - SIWE login
  - task create
  - on-chain escrow lock
  - hire
  - transaction sync
  - post-write reads
- `full-fixture`
  - everything in `core`
  - seeded release fixture verification
  - seeded refund fixture verification

## Required Production Secrets

- `SMOKE_SIWE_PRIVATE_KEY`
- `SMOKE_AGENT_ID`
- `SMOKE_TASK_REWARD_WEI`
- `SMOKE_ESCROW_LOCK_WEI`

## Optional Production Secrets And Vars

- `SMOKE_CRON_SECRET`
- `SMOKE_RELEASE_TASK_ID`
- `SMOKE_RELEASE_TX_HASH`
- `SMOKE_REFUND_TASK_ID`
- `SMOKE_REFUND_TX_HASH`
- `VERCEL_PROTECTION_BYPASS`
- variable `SMOKE_SYNC_TX_MODE`

## Fixture Rules

- Release fixtures must point to a smoke-owned task already in `completed` / `Complete`.
- Refund fixtures must point to a smoke-owned task that is `failed` or still under dispute.
- Fixture tx hashes must be real Base mainnet escrow release/refund transactions for those task ids.

## Artifacts

Every run uploads:

- run metadata
- task id
- lock tx hash
- sync tx hash
- captured API responses
- cleanup state
- failure screenshots and HTML snapshots
