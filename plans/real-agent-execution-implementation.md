# Real Agent Execution Implementation

## Summary
- Add `tasks.execution_result` storage, server-side agent execution, a protected task-result API, a result modal in the UI, and use the persisted execution output as the proof input during final completion.

## Key Changes
- Update Supabase schema so `tasks` has `execution_result JSONB`; apply the change in `supabase/seed.sql` and as a live DB migration.
- Add `frontend/src/lib/agentExecutor.ts` using `@anthropic-ai/sdk`, a 60s timeout, one system prompt per agent type, strict JSON output parsing, and the v1 model default `claude-sonnet-4-20250514`.
- Extend `frontend/src/lib/types/database.ts` with `execution_result` and add a shared `AgentExecutionResult` type in `frontend/src/lib/types/index.ts`.
- Keep `execution_result` off the public task list payloads; expose it only through a protected result endpoint.
- Update `frontend/src/app/api/tasks/[id]/advance/route.ts` so `Assigned -> Executing` runs the agent, stores `execution_result`, and stays on `Assigned` if execution fails or agent metadata is incomplete.
- Update the final `ZK Verifying -> Complete` step to hash and prove the stored execution result instead of the current synthetic JSON payload.
- Add `frontend/src/app/api/tasks/[id]/result/route.ts`; allow only the task submitter or an admin to fetch the stored result.
- Add `frontend/src/hooks/useTaskResult.ts` and `frontend/src/components/dashboard/TaskResultModal.tsx`; wire `frontend/src/components/dashboard/TaskCard.tsx` to show `View Result` for completed tasks the submitter can access.
- Add `ANTHROPIC_API_KEY` to runtime env handling; keep the model constant in code for v1.

## Tests and Validation
- Run `npm run lint` and `npm run build` in `frontend`.
- Manual QA: hire an agent for a task, confirm the task advances to `Executing`, confirm `execution_result` is stored, confirm execution failure leaves the task at `Assigned`, confirm the submitter can open the result modal, confirm unauthorized result fetch returns `401/403`, and confirm the completion proof uses the stored result.

## Assumptions
- Anthropic calls stay server-side only.
- The stored result shape is `{ summary, findings, recommendations, metadata }`.
- This branch only covers real agent execution, not broader repo cleanup.
