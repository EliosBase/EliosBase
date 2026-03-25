# Local Setup

## Prerequisites

- Node.js 20+
- npm 10+
- Foundry
- A Supabase project
- Base Sepolia RPC access

## Bootstrapping

1. Copy `.env.example` to `.env.local` and fill in every required value.
2. Apply `supabase/seed.sql` to the target Supabase database.
3. Install frontend dependencies:

```bash
cd frontend
npm install
```

4. Start the frontend:

```bash
npm run dev
```

5. In another shell, validate contracts:

```bash
forge test
```

## Local Verification

- Sign in through SIWE.
- Open marketplace, tasks, wallet, and security pages.
- Confirm the frontend can read from Supabase and Base Sepolia.
