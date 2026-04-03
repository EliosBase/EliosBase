# Release Workflow

## Branches

- `main` is production.
- All delivery work starts on a feature-style branch: `feature/*`, `fix/*`, `hotfix/*`, `chore/*`, `codex/*`, `deps/*`, or `dependabot/*`.
- There is no long-lived `staging` branch in the release path.

## GitHub Enforcement

- `branch-policy` fails any PR into `main` unless the head branch uses an approved feature-style prefix.
- `preview-smoke` runs against the Vercel preview deployment for the PR head commit.
- `preview-smoke` skips cleanly when a PR does not touch `frontend/`.
- `main-auto-merge` enables GitHub auto-merge for PRs into `main` when the PR has the `automerge` label.
- `branch-cleanup` deletes merged feature branches.
- Dependabot opens and auto-merges only into `main`, never into a separate staging branch.

## Promotion Path

1. Create a feature branch from `main`.
2. Open a PR into `main`.
3. Let Vercel build the branch preview deployment.
4. Let `preview-smoke` validate that preview deployment.
5. Add the `automerge` label if the PR should merge as soon as it is approved and checks pass.
6. Merge into `main` after `preview-smoke` and the required PR checks are green, or let GitHub auto-merge it if `automerge` is enabled.
7. Let `production-smoke` validate `https://eliosbase.net` after the production deploy lands.
8. Run `production-live-e2e` before launch sign-off or after any production change that touches live write paths.

## Required GitHub Branch Protection

Apply these rules in GitHub after the workflows are on the default branch.

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
  - `preview-smoke`

## Vercel Preview Setup

The linked Vercel project already exists. Use the standard `preview` environment for non-production deployments.

- Every non-`main` branch gets its own Vercel preview deployment.
- `preview-smoke` resolves the preview URL from the Vercel API using the PR head branch and commit SHA.
- Protected preview deployments require a repo secret named `VERCEL_PROTECTION_BYPASS`.
- The GitHub workflow needs:
  - repo variable `VERCEL_PROJECT_ID`
  - repo variable `VERCEL_TEAM_ID`
  - repo secret `VERCEL_TOKEN`
  - repo secret `VERCEL_PROTECTION_BYPASS`

## Preview Environment Standard

- Put shared non-production app config in the Vercel `preview` environment.
- Do not hard-code `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_FRAMES_BASE_URL` for previews.
- The app derives preview origins from `NEXT_PUBLIC_VERCEL_BRANCH_URL` and falls back to the generated deployment URL.
- Vercel cron only targets production, so preview branches remain read-only unless someone explicitly calls a protected route.
- If preview infra is not fully isolated yet, keep preview smoke read-only by leaving authenticated mutation smoke secrets unset.

## Auto-Merge Standard

- Use the `automerge` label only when the PR should merge without another manual click.
- `automerge` does not bypass protection. `main` still requires at least 1 approval and all required checks.
- Removing the `automerge` label disables GitHub auto-merge for that PR.
- Draft PRs never auto-merge.

## Fast Summary For Another Agent

- Feature branches open PRs directly into `main`.
- Each PR gets a Vercel preview deployment.
- `preview-smoke` must pass before `main` can be merged.
- Add `automerge` to let GitHub merge the PR automatically after approval and green checks.
- `production-smoke` runs after merge to `main`.
- `production-live-e2e` is the manual live write-path sign-off for production.
- Preview URLs are per-branch, not a shared staging domain.
