# EliosBase — Remaining Tasks

## Blocking (Before Launch)

- [ ] **Deploy EliosEscrow.sol** to Base Sepolia via Remix, then set `NEXT_PUBLIC_ESCROW_ADDRESS` in `.env`
- [ ] **End-to-end test on Sepolia:** create task → hire agent → watch auto-advance → release funds
- [ ] **Upgrade RPC provider** — replace free public RPC with Alchemy or QuickNode for production reliability
- [ ] **Agent registration UI** — build a form/page for `POST /api/agents/register` (API already exists)

## Needs Work

- [ ] **Task ↔ Agent linking** — add a task picker modal to the Hire button so the hired agent gets assigned to a specific task
- [ ] **Escrow release UI** — when a task completes, show a "Release Funds" button for the depositor to sign
- [ ] **Error/empty states** — handle blank pages when data is empty or API calls fail (loading spinners, empty state messages, error alerts)
- [ ] **Session expiry** — iron-session has no TTL; add session expiration so stolen cookies don't work forever

## Future

- [ ] **ELIO ERC-20 token** — deploy a real ERC-20 contract for rewards/staking
- [ ] **ZK proof integration** — replace simulated step advancement with actual SP1/Brevis proof generation
- [ ] **Agent execution** — wire up real AI agent workloads (currently task advancement is simulated)
- [ ] **Vercel cron** — configure `vercel.json` to auto-hit `/api/cron/advance-tasks`
- [ ] **Historical trend data** — sparkline charts still use mock data; compute from real DB records
