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
```

## Key Runtime Areas

- `src/app/api/` for API routes
- `src/app/app/` for the authenticated dashboard pages
- `src/lib/` for Supabase, proof, contract, and session code
- `src/components/dashboard/` for task, agent, wallet, and security UI

## Additional Docs

- `../docs/local-setup.md`
- `../docs/deployment-runbook.md`
- `../docs/contracts-circuits-runbook.md`
- `../docs/manual-smoke-checklist.md`
