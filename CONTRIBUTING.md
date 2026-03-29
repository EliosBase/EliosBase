# Contributing

## Baseline

- Branch from `main`.
- Keep `git config core.hooksPath .githooks` enabled.
- Do not push directly to `main`.
- Keep changes scoped. Split unrelated work into separate pull requests.

## Local Setup

```bash
git submodule update --init --recursive
cp frontend/.env.example frontend/.env.local
cd frontend
npm install
```

Foundry is required for contract work:

```bash
forge test
```

## Validation

Run the full validation set before opening a pull request:

```bash
cd frontend
npm test
npm run lint
npm run build
npm run e2e
cd ..
forge test
```

If a check is intentionally skipped, call it out in the pull request.

## Pull Requests

Each pull request should include:

- a short problem statement
- the concrete change made
- risk notes
- test evidence

Keep commit messages terse and human. Do not add AI attribution or co-author trailers.

## Security And Secrets

- Never commit secrets, wallet keys, session cookies, or copied production env files.
- Treat contract addresses, RPC settings, and cron auth as deployment-sensitive changes.
- Use private reporting for security issues. See `SECURITY.md`.
