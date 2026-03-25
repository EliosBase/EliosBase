# EliosBase Frontend

## Requirements

- Node.js 20+
- npm 10+
- A configured Supabase project
- Base or Base Sepolia RPC access

## Local Setup

1. Copy the root `.env.example` and fill in the required values.
2. Install dependencies:

```bash
npm install
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run build
npm run smoke:real
```

These checks now run in CI together with `forge test`.
Set `SMOKE_BASE_URL` before running the real-environment smoke script, and optionally provide `SMOKE_CRON_SECRET`, `SMOKE_SESSION_COOKIE`, and `SMOKE_TASK_ID` for deeper coverage.

## Key Runtime Areas

- `src/app/api/` for API routes
- `src/app/app/` for the authenticated dashboard pages
- `src/lib/` for Supabase, proof, contract, and session code
- `src/components/dashboard/` for task, agent, wallet, and security UI

## Additional Docs

- `../runbooks/local-setup.md`
- `../runbooks/deployment-runbook.md`
- `../runbooks/contracts-circuits-runbook.md`
- `../runbooks/manual-smoke-checklist.md`
