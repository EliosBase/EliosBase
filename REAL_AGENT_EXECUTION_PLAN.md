# Real AI Agent Execution for ElioseBase

## Context

Currently, when a task reaches the "Executing" step, nothing happens — it just waits 60 seconds and auto-advances. Agents don't actually do any work. This plan adds real AI execution using the Claude API, so agents produce real outputs (audit reports, code reviews, data analysis) that feed into the ZK proof system.

---

## Architecture

```
Task Assigned → Agent receives task description
    → Claude API generates real output based on agent type & capabilities
    → Output stored in DB (execution_result column)
    → Output feeds into ZK proof as resultData
    → Proof verified on-chain with real work commitment
```

---

## Phase 1: Agent Executor Module

### 1A — Install Claude SDK
- `npm install @anthropic-ai/sdk` in frontend

### 1B — Agent Executor
- **New:** `frontend/src/lib/agentExecutor.ts`
- Maps agent types to specialized system prompts:
  - `sentinel` → Security monitoring & threat detection
  - `analyst` → Data analysis & pattern recognition
  - `executor` → Smart contract audit & code review
  - `auditor` → Compliance audit & verification
  - `optimizer` → Gas optimization & performance analysis
- Function: `executeAgentTask(task, agent)` → returns structured result
- Calls Claude API with agent-specific system prompt + task description
- Returns `{ summary, findings, recommendations, metadata }`
- Timeout: 60 seconds max
- Model: `claude-sonnet-4-20250514` (fast, capable, cost-effective)

---

## Phase 2: Database Changes

### 2A — Add columns
SQL to run in Supabase:
```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_result JSONB;
```

### 2B — Update types
- **Modify:** `frontend/src/lib/types/database.ts` — add `execution_result` to DbTask
- **Modify:** `frontend/src/lib/types/index.ts` — add `executionResult?` to Task
- **Modify:** `frontend/src/lib/transforms.ts` — map the new field

---

## Phase 3: Wire Execution into Task Flow

### 3A — Modify Advance Route
- **Modify:** `frontend/src/app/api/tasks/[id]/advance/route.ts`
- When transitioning `Assigned → Executing`:
  - Fetch the assigned agent's type, capabilities, and description
  - Call `executeAgentTask(task, agent)` with Claude API
  - Store result in `tasks.execution_result` column
  - If execution fails, stay at "Assigned" step (don't advance)
- When transitioning `Executing → ZK Verifying → Complete`:
  - Read `execution_result` from DB
  - Pass real result as `resultData` to `generateTaskProof()`

### 3B — Add Task Result API
- **New:** `frontend/src/app/api/tasks/[id]/result/route.ts`
- GET endpoint to retrieve execution result for a task
- Returns the structured agent output (summary, findings, etc.)
- Auth required — only task submitter or admin can view

---

## Phase 4: Frontend — Display Results

### 4A — Task Result View
- **New:** `frontend/src/components/dashboard/TaskResultModal.tsx`
- Modal that shows the agent's execution output
- Sections: Summary, Findings (with severity), Recommendations
- Styled to match existing glass card pattern

### 4B — TaskCard Integration
- **Modify:** `frontend/src/components/dashboard/TaskCard.tsx`
- Add "View Result" button on completed tasks
- Opens TaskResultModal with the execution output

### 4C — Result Hook
- **New:** `frontend/src/hooks/useTaskResult.ts`
- Fetches task result from `/api/tasks/[id]/result`

---

## Phase 5: Environment Variables

Add to `.env.local` and Vercel:
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Key Files

| File | Action |
|---|---|
| `frontend/src/lib/agentExecutor.ts` | New — Claude API execution engine |
| `frontend/src/app/api/tasks/[id]/result/route.ts` | New — result retrieval API |
| `frontend/src/components/dashboard/TaskResultModal.tsx` | New — result display modal |
| `frontend/src/hooks/useTaskResult.ts` | New — result fetch hook |
| `frontend/src/app/api/tasks/[id]/advance/route.ts` | Modify — trigger real execution |
| `frontend/src/lib/types/database.ts` | Modify — add execution_result |
| `frontend/src/lib/types/index.ts` | Modify — add executionResult |
| `frontend/src/lib/transforms.ts` | Modify — map new field |
| `frontend/src/components/dashboard/TaskCard.tsx` | Modify — add View Result button |

---

## Execution Order

```
Phase 1 (Agent Executor)     ← Claude API integration
Phase 2 (Database)           ← Add execution_result column
Phase 3 (Wire into flow)     ← Connect executor to task advancement
Phase 4 (Frontend)           ← Display results to users
Phase 5 (Env vars)           ← API key on Vercel
```

---

## Agent Type → Prompt Mapping

| Agent Type | Role | What It Does |
|---|---|---|
| `sentinel` | Security Monitor | Scans for vulnerabilities, threat patterns, attack vectors |
| `analyst` | Data Analyst | Analyzes data, identifies trends, produces insights |
| `executor` | Code Executor | Smart contract audit, code review, implementation analysis |
| `auditor` | Compliance Auditor | Checks compliance, regulatory alignment, best practices |
| `optimizer` | Performance Optimizer | Gas optimization, efficiency analysis, performance recommendations |

---

## Output Schema

```typescript
interface AgentExecutionResult {
  summary: string;           // 1-2 sentence overview
  findings: {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    description: string;
  }[];
  recommendations: string[]; // actionable items
  metadata: {
    model: string;           // claude model used
    tokensUsed: number;
    executionTimeMs: number;
    agentType: string;
    capabilities: string[];
  };
}
```

---

## Verification

1. Create a task "Audit the USDC contract for vulnerabilities"
2. Register a `sentinel` agent and hire it for the task
3. Watch task advance to "Executing" — Claude API generates a real audit report
4. Task advances to "ZK Verifying" — real output feeds into ZK proof
5. Click "View Result" on completed task — see the full report
6. ZK proof on BaseScan commits to the hash of the real agent output
