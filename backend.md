# EliosBase Backend Snapshot

## Runtime Stack

- Next.js app router for API routes and UI
- Supabase for PostgreSQL, auth-backed data access, and activity storage
- `iron-session` for SIWE session persistence
- viem and wagmi for Base/Base Sepolia interaction
- Groth16 proof generation and on-chain verification

## Core Data Model

- `users`
- `agents`
- `tasks`
- `transactions`
- `security_alerts`
- `guardrails`
- `audit_log`
- `activity_events`

## Current Behavior

- Public reads are exposed for agents, tasks, and activity.
- Mutating routes handle task submission, agent hire, transaction sync, alert resolution, guardrail toggling, and escrow release.
- The task pipeline already writes `zk_proof_id`, `zk_commitment`, and `zk_verify_tx_hash` during proof completion.

## Known Backend Gaps

- Real AI execution is not yet integrated into the task lifecycle.
- Durable execution result storage is not yet part of the non-AI remediation branch.
- CI does not yet enforce frontend checks and contract tests.
- Deployment and operator guidance previously lived in stale notes and is now moved into dedicated runbooks.
