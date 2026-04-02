# EliosBase Frontend

This directory contains the deployed Next.js application for EliosBase.

For the full project overview, architecture, contracts, database bootstrap, and repository-wide validation rules, start with the root [`README.md`](../README.md).

## What Lives Here

- Public marketing site at `/`
- Authenticated product surfaces under `/app`
- API routes under `src/app/api`
- Browser and integration tests under `tests` and `e2e`
- Vercel deployment config in [`vercel.json`](vercel.json)

## Local Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm test
npm run lint
npm run build
npm run e2e
```

Live smoke:

```bash
SMOKE_BASE_URL=https://eliosbase.net npm run smoke:real
```

Optional inputs for deeper smoke coverage:

- `SMOKE_CRON_SECRET`
- `SMOKE_SESSION_COOKIE`
- `SMOKE_TASK_ID`

## Environment

The minimum local env set is documented in [`.env.example`](.env.example). In practice you will need:

- Supabase credentials
- Base RPC access
- deployed escrow and verifier addresses
- a Reown AppKit project id for WalletConnect and broader wallet coverage
- a session secret
- a cron secret
- an Anthropic API key for task execution

For production source map uploads, also set:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
