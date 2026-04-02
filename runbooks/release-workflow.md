# Release Workflow

## Branches

- `main` is production. Nothing merges into `main` except `staging`.
- `staging` is the shared pre-production branch. It deploys to `https://staging.eliosbase.net`.
- All delivery work starts on a feature-style branch: `feature/*`, `fix/*`, `hotfix/*`, `chore/*`, `codex/*`, `deps/*`, or `dependabot/*`.

## GitHub Enforcement

- `branch-policy` fails any PR into `main` unless the head branch is `staging`.
- `branch-policy` fails any PR into `staging` unless the head branch uses an approved feature-style prefix.
- `release-pr` creates or refreshes the `staging -> main` PR every time `staging` moves.
- `branch-cleanup` will delete merged feature branches, but it will not delete `staging`.
- Dependabot now opens and auto-merges only into `staging`, never directly into `main`.

## Promotion Path

1. Create a feature branch from `staging`.
2. Open a PR into `staging`.
3. Merge into `staging` after CI passes.
4. Let `staging-smoke` validate the shared staging deployment at `https://staging.eliosbase.net`.
5. Merge the generated `staging -> main` release PR after `staging-smoke` and PR checks are green.
6. Let `production-smoke` validate `https://eliosbase.net` after the production deploy lands.

## Required GitHub Branch Protection

Apply these rules in GitHub after the workflows are on the default branch:

### `staging`

- Require a pull request before merging.
- Require at least 1 approval.
- Require branch to be up to date before merging.
- Require these status checks:
  - `branch-policy`
  - `frontend`
  - `contracts`
  - `Analyze JavaScript and TypeScript`
  - `scan`
  - `dependency-review`

### `main`

- Require a pull request before merging.
- Require at least 1 approval.
- Require branch to be up to date before merging.
- Require these status checks:
  - `branch-policy`
  - `frontend`
  - `contracts`
  - `Analyze JavaScript and TypeScript`
  - `scan`
  - `dependency-review`
  - `staging-smoke`

## Vercel Staging Setup

The linked Vercel project already exists. The missing piece is a real staging environment with non-production secrets.

Create a Vercel custom environment:

- Slug: `staging`
- Branch matcher: branches ending with `staging`
- Domain: `staging.eliosbase.net`

Do not clone production secrets into staging. Staging needs its own values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `BASE_RPC_URL`
- `NEXT_PUBLIC_CHAIN`
- `NEXT_PUBLIC_BASE_CHAIN_ID`
- `NEXT_PUBLIC_ESCROW_ADDRESS`
- `NEXT_PUBLIC_VERIFIER_ADDRESS`
- `PROOF_SUBMITTER_PRIVATE_KEY`
- `SAFE_POLICY_SIGNER_PRIVATE_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_FRAMES_BASE_URL`

Shared external service secrets can be reused if that is intentional:

- `ANTHROPIC_API_KEY`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

## Staging Infrastructure Standard

- Use a separate Supabase project for staging.
- Use separate Base contracts and signer keys for staging.
- Point `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_FRAMES_BASE_URL` at `https://staging.eliosbase.net`.
- Keep staging cron enabled only after the staging signer and chain config are in place.
- Until isolated staging infra exists, keep `STAGING_SMOKE_*` secrets unset so staging smoke stays read-only.

## Fast Summary For Another Agent

- Feature branches go to `staging`.
- `staging` is the only branch that can go to `main`.
- `staging-smoke` must pass before `main` can be merged.
- `production-smoke` runs after merge to `main`.
- Never reuse production Supabase or signing keys in staging.
