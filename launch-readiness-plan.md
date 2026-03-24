# Elios Launch Readiness Plan

## Summary

Elios is close to launchable from a feature perspective. The remaining work for a public Base mainnet launch is mostly operational and infrastructure-critical, not product-surface expansion.

The current platform already covers core marketplace flows, proof submission, CI validation, route-level tests, browser E2E, and a real smoke runner. The launch blockers are environment correctness, deployment discipline, observability, incident handling, and operator recovery paths.

## Launch Blockers

### 1. Merge The Two Review Branches First

The launch baseline should include both existing review branches before any further readiness work begins:

- `ghost369/real-agent-execution`
- `ghost369/repo-gap-remediation`

These branches contain the real execution path, execution result persistence, retry hardening, schema remediation, runbooks, smoke coverage, and CI improvements. Public launch should not proceed without them.

### 2. Fix Chain And Environment Consistency

Chain behavior must be fully environment-driven across the full stack.

Required work:

- Remove hardcoded Base mainnet assumptions from SIWE verification.
- Make auth, wallet config, proof submission, and cron behavior all resolve from the same chain configuration.
- Verify the system can switch cleanly between Base Sepolia and Base mainnet through environment variables only.
- Add tests that prove no code changes are required when changing target chain.

This is a launch blocker because the repo currently mixes mainnet-only behavior with testnet-oriented defaults.

### 3. Make Live Smoke A Release Gate

The platform already has a deploy-targeted smoke runner, but launch readiness requires it to become mandatory for releases.

Required work:

- Run live smoke against the deployed environment before each production promotion.
- Require the smoke workflow to pass before a release is considered valid.
- Cover these paths in the live smoke:
  - SIWE sign-in
  - task submission
  - agent hire
  - task execution
  - protected result fetch
  - proof submission
  - escrow release
  - security alert resolution

Without this, the system is still relying too heavily on operator trust and local validation.

### 4. Add Production Observability And Alert Delivery

The platform has audit logs and in-app security alerts, but that is not enough for launch.

Required integrations:

- Sentry or equivalent for runtime exceptions
- operator alert delivery through Slack, PagerDuty, or webhook-based paging
- metrics collection for:
  - execution latency
  - retry counts
  - terminal execution failures
  - Anthropic error classes
  - proof submission failures
  - cron failures
  - signer balance health
  - payout latency

This is the difference between “it works” and “it can be operated safely.”

### 5. Operationalize Secrets And Signer Ownership

Secrets currently exist as config requirements, but launch needs clear production ownership and lifecycle rules.

Required work:

- assign owners for:
  - `ANTHROPIC_API_KEY`
  - `PROOF_SUBMITTER_PRIVATE_KEY`
  - `CRON_SECRET`
  - Supabase service credentials
- store all production secrets in a proper secret manager
- define rotation cadence and emergency rotation procedure
- define signer recovery procedure if proof submission fails or the key is compromised
- monitor proof submitter balance and failed transaction conditions

This is a hard launch requirement because proof completion depends on an operational signer, not just application code.

### 6. Add Rollback And Recovery Procedures

Current runbooks describe deployment order, but not full recovery.

Required work:

- define rollback procedure for frontend deploys
- define rollback procedure for Supabase schema changes
- define recovery procedure for mismatched circuit artifacts or verifier config
- define operator procedure for stuck tasks, failed proofs, and partial deploys

A public launch without rollback discipline is not acceptable.

## High-Priority Post-Blocker Work

### 7. Add Operator Remediation Controls

Public launch needs admin/operator controls for failure handling.

Required capabilities:

- retry a failed task manually
- requeue a task
- reassign a task to another agent
- mark a task as refunded or cancelled
- release or recover escrow safely when automation fails

The current retry hardening is good, but it still assumes operators will intervene outside dedicated tooling.

### 8. Add AI Execution Governance

The AI execution path is now real, but launch requires governance around quality, cost, and regressions.

Required work:

- track prompt version and model version per execution
- record spend and failure rates by model
- add spend ceilings and execution safeguards
- add an operator override path for tasks that should not auto-progress

### 9. Automate Production Promotion

The repo has validation and runbooks, but the deploy process is still operator-driven.

Required work:

- automate environment promotion
- wire production smoke into deployment flow
- require successful validation and smoke before promotion completes

## Marketplace Trust Gaps

### 10. Add Commercial Safety Flows

Inference: if Elios is launching as a real public marketplace, it needs commercial trust controls beyond technical completion.

Recommended work before broad public launch:

- task cancellation policy
- dispute handling path
- refund path
- acceptance or rejection rules for completed work
- clear escrow recovery rules for failed or abandoned execution

The current codebase appears technically centered on execution, proof, and release. That is not the same as being marketplace-safe.

## Interfaces And Integrations To Add

New or extended production interfaces should include:

- env-driven chain id and network selection
- monitoring DSN and alert webhook configuration
- signer balance and proof-submitter health monitoring
- operator-only remediation endpoints or admin UI
- release gating around live smoke and deploy verification

## Test Plan

Required test and validation coverage:

- config-parity tests across Sepolia and mainnet
- live smoke against deployed environments
- failure drills for:
  - Anthropic outage
  - invalid Anthropic key
  - exhausted retry budget
  - proof revert
  - low signer balance
  - stale circuit artifact
  - cron auth failure
- operator drill for:
  - alert acknowledgement
  - failed-task inspection
  - retry or reassign or refund
  - audit trail verification

## Assumptions

- This plan targets public Base mainnet launch.
- Both review branches land before launch-hardening begins.
- Base remains the chain family for launch.
- The dispute and refund recommendations are inferred from the public-launch target, not from an explicit product spec already present in the repo.
