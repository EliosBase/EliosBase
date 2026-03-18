# EliosBase Backend — Implementation Plan

## Context
The frontend dashboard is complete with 5 pages, Phantom wallet connection, and mock data. We need to add a real backend using Supabase (PostgreSQL) with SIWE auth, all within the existing Next.js repo. The project runs exclusively on **Base network**.

## New Dependencies
```
@supabase/supabase-js  @supabase/ssr  siwe  ethers  iron-session
```

## Environment Variables (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXTAUTH_SECRET=<random-32-byte-hex>
NEXT_PUBLIC_BASE_CHAIN_ID=8453
```

---

## 1. Supabase Database Schema

**8 tables** derived from existing interfaces in `src/lib/mock-data.ts`:

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `users` | id (UUID PK), wallet_address (unique), role (submitter/operator/admin), created_at, last_seen_at | New — required for auth |
| `agents` | id (text PK), name, description, capabilities (text[]), reputation, tasks_completed, price_per_task, status, type, owner_id (FK→users) | Public read, write via API |
| `tasks` | id (text PK), title, description, status, current_step, assigned_agent (FK→agents), reward, submitter_id (FK→users), submitted_at, completed_at, zk_proof_id | Public read, create requires auth |
| `transactions` | id (text PK), type, from, to, amount, token, status, timestamp, tx_hash, user_id (FK→users) | Private — user's own only |
| `security_alerts` | id (text PK), severity, title, description, source, timestamp, resolved | Auth read, service-role write |
| `guardrails` | id (text PK), name, description, status, triggered_count | Auth read, service-role write |
| `audit_log` | id (bigserial PK), timestamp, action, actor, target, result | Auth read, service-role write |
| `activity_events` | id (text PK), type, message, timestamp, user_id (FK→users) | Public read, service-role write |

**RLS strategy (MVP):** Public data (agents, tasks, activity) readable via anon key. Private data (transactions, security) denied via anon key — accessed only through API routes using service role key. Authorization enforced in application code.

### Full SQL Schema

```sql
-- Users (wallet-based auth)
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'submitter' CHECK (role IN ('submitter', 'operator', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_users_wallet ON users (wallet_address);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  reputation INT NOT NULL DEFAULT 0 CHECK (reputation >= 0 AND reputation <= 100),
  tasks_completed INT NOT NULL DEFAULT 0,
  price_per_task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'busy', 'offline')),
  type TEXT NOT NULL CHECK (type IN ('sentinel', 'analyst', 'executor', 'auditor', 'optimizer')),
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  current_step TEXT NOT NULL DEFAULT 'Submitted' CHECK (current_step IN ('Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete')),
  assigned_agent TEXT REFERENCES agents(id),
  reward TEXT NOT NULL,
  submitter_id UUID REFERENCES users(id) NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  zk_proof_id TEXT
);
CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_submitter ON tasks (submitter_id);

-- Transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('escrow_lock', 'escrow_release', 'payment', 'reward', 'stake')),
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  amount TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'pending', 'failed')),
  timestamp TIMESTAMPTZ DEFAULT now(),
  tx_hash TEXT NOT NULL,
  user_id UUID REFERENCES users(id)
);
CREATE INDEX idx_tx_user ON transactions (user_id);
CREATE INDEX idx_tx_hash ON transactions (tx_hash);

-- Security Alerts
CREATE TABLE security_alerts (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false
);

-- Guardrails
CREATE TABLE guardrails (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'triggered')),
  triggered_count INT NOT NULL DEFAULT 0
);

-- Audit Log
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('ALLOW', 'DENY', 'FLAG'))
);
CREATE INDEX idx_audit_timestamp ON audit_log (timestamp DESC);

-- Activity Events
CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('task', 'agent', 'payment', 'security', 'proof')),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES users(id)
);
CREATE INDEX idx_activity_timestamp ON activity_events (timestamp DESC);

-- RLS Policies
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents_public_read" ON agents FOR SELECT USING (true);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_public_read" ON tasks FOR SELECT USING (true);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_public_read" ON activity_events FOR SELECT USING (true);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_transactions" ON transactions FOR ALL USING (false);

ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_alerts" ON security_alerts FOR ALL USING (false);

ALTER TABLE guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_guardrails" ON guardrails FOR ALL USING (false);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_audit" ON audit_log FOR ALL USING (false);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_users" ON users FOR ALL USING (false);
```

---

## 2. SIWE Authentication Flow

1. User connects Phantom (already works via wagmi)
2. `GET /api/auth/nonce` → generates random nonce, stores in iron-session cookie
3. Frontend constructs SIWE message, Phantom signs it (`useSignMessage` from wagmi)
4. `POST /api/auth/verify` → verifies signature + nonce, upserts user in `users` table, sets session cookie
5. All subsequent API calls authenticated via session cookie
6. `POST /api/auth/logout` → clears cookie

**Session data** (iron-session encrypted cookie):
```ts
{ nonce?: string; userId?: string; walletAddress?: string; chainId?: number }
```

---

## 3. API Routes

```
src/app/api/
  auth/
    nonce/route.ts            GET     generate nonce
    verify/route.ts           POST    verify SIWE, create session
    session/route.ts          GET     return current session
    logout/route.ts           POST    destroy session
  agents/
    route.ts                  GET     list agents (?type=&status=&search=)
    [id]/route.ts             GET     single agent
    register/route.ts         POST    register agent (auth, operator role)
  tasks/
    route.ts                  GET     list tasks (?status=)
                              POST    submit task (auth required)
    [id]/route.ts             GET     single task
                              PATCH   update task step/status (auth)
  transactions/
    route.ts                  GET     user's transactions (auth)
    sync/route.ts             POST    sync on-chain tx to DB (auth)
  security/
    alerts/route.ts           GET     list alerts (auth)
    guardrails/route.ts       GET     list guardrails (auth)
    audit-log/route.ts        GET     audit log (auth)
  activity/
    route.ts                  GET     activity feed
```

**14 route files total.**

---

## 4. Key Files to Create

### Supabase Clients
- `src/lib/supabase/client.ts` — browser client (anon key, respects RLS)
- `src/lib/supabase/server.ts` — service role client for API routes (bypasses RLS)

### Session
- `src/lib/session.ts` — iron-session config + `getSession()` helper

### Types & Transforms
- `src/lib/types/database.ts` — DB row types (snake_case)
- `src/lib/types/index.ts` — re-exports
- `src/lib/transforms.ts` — DB row → frontend type mappers (snake_case → camelCase), so existing component props don't change

### Auth
- `src/hooks/useAuth.ts` — SIWE sign-in/out flow, wraps usePhantom + useSignMessage
- `src/providers/AuthProvider.tsx` — context provider for auth state

### Data Hooks (one per resource, using React Query)
- `src/hooks/useAgents.ts`
- `src/hooks/useTasks.ts`
- `src/hooks/useTransactions.ts`
- `src/hooks/useSecurityAlerts.ts`
- `src/hooks/useGuardrails.ts`
- `src/hooks/useAuditLog.ts`
- `src/hooks/useActivity.ts`

### Realtime
- `src/hooks/useRealtimeActivity.ts` — Supabase Realtime subscription → invalidates React Query cache on INSERT to `activity_events`
- Same pattern for `tasks` and `agents` tables

---

## 5. Page Migration (mock → Supabase)

Each page swaps `import { X } from '@/lib/mock-data'` for the corresponding `useX()` hook. **Order:**

1. **Marketplace** — simplest (read-only agents). `useAgents()` replaces `agents` import.
2. **Tasks** — read + submit mutation. `useTasks()` + wire `TaskSubmitModal` to `POST /api/tasks`.
3. **Dashboard** — uses agents, tasks, activity. Replace all three imports.
4. **Wallet** — `useTransactions()` replaces `transactions` import.
5. **Security** — `useSecurityAlerts()`, `useGuardrails()`, `useAuditLog()`.

**Modified existing files:** 5 pages + `app/app/layout.tsx` (add AuthProvider) + `DashboardHeader.tsx` (SIWE trigger after connect).

---

## 6. Implementation Sequence

| Step | What | Files | Depends On |
|------|------|-------|------------|
| 1 | Create Supabase project, run SQL schema, seed with mock data | Supabase dashboard | — |
| 2 | Install deps, create `.env.local`, add to `.gitignore` | `package.json`, `.env.local` | Step 1 |
| 3 | Supabase client files | `lib/supabase/client.ts`, `lib/supabase/server.ts` | Step 2 |
| 4 | Session config | `lib/session.ts` | Step 2 |
| 5 | Auth API routes (4 files) | `api/auth/*` | Steps 3–4 |
| 6 | `useAuth` hook + `AuthProvider` | `hooks/useAuth.ts`, `providers/AuthProvider.tsx` | Step 5 |
| 7 | Wire auth into layout + header | `app/app/layout.tsx`, `DashboardHeader.tsx` | Step 6 |
| 8 | Types + transforms | `lib/types/*`, `lib/transforms.ts` | Step 3 |
| 9 | Data API routes (10 files) | `api/agents/*`, `api/tasks/*`, etc. | Steps 3–4, 8 |
| 10 | Data hooks (7 files) | `hooks/use*.ts` | Step 9 |
| 11 | Migrate pages one at a time | 5 page files | Step 10 |
| 12 | Realtime hooks | `hooks/useRealtime*.ts` | Step 3 |
| 13 | Remove `mock-data.ts` | cleanup | Step 11 |

---

## 7. Key Design Decisions

- **iron-session over Supabase Auth** — Supabase Auth doesn't natively support SIWE. iron-session gives encrypted cookies with zero infrastructure.
- **Service role in API routes** — instead of custom JWT + RLS `auth.uid()`. Simpler for MVP; RLS blocks direct anon-key access as a safety net.
- **API routes over server actions** — more portable if other clients need the API later.
- **Transforms layer** — DB snake_case → frontend camelCase at the boundary. Zero changes to existing component props.
- **Base network only** — wagmi config locked to chain ID 8453. SIWE verification enforces `chainId: 8453`.

## 8. Verification
- `npx next build` — clean build
- Connect Phantom → SIWE sign prompt appears → session created
- `GET /api/auth/session` returns wallet address
- All 5 pages load data from Supabase instead of mock data
- Submit a task → appears in DB and on tasks page
- Activity feed updates in realtime
- Disconnect wallet → session cleared
