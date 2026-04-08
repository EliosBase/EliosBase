# x402 Preview Workflow

Use this workflow to validate one real paid x402 execution against a Vercel preview deployment before merging the Week 2 branch.

## What It Proves

- `GET /api/agents/[id]/capabilities` returns a payable capability manifest
- `POST /api/agents/[id]/execute` returns a real `402 Payment Required` challenge when unpaid
- the same route accepts an x402 payment and creates a task
- the resulting task receipt and public activity graph reflect the paid execution

## GitHub Workflow

- Workflow: `preview-live-x402`
- Trigger: manual `workflow_dispatch`
- Inputs:
  - `base_url` optional override when you already know the preview URL
  - `agent_id` optional override when you want to pin the payable preview agent

If `base_url` is omitted, the workflow resolves the Vercel preview deployment for the branch SHA. If Vercel did not create one, it falls back to a manual preview deploy from the checked-out branch.

## Required GitHub Secrets And Vars

- repo var `VERCEL_PROJECT_ID`
- repo var `VERCEL_TEAM_ID`
- repo secret `VERCEL_TOKEN`
- repo secret `VERCEL_PROTECTION_BYPASS`
- repo secret `PREVIEW_X402_PRIVATE_KEY`
- optional repo secret `PREVIEW_X402_AGENT_ID`
- optional repo var `PREVIEW_X402_NETWORK`

`PREVIEW_X402_PRIVATE_KEY` should control a funded preview-only wallet. Do not reuse a production treasury or personal wallet.

## Artifact Output

Every run uploads:

- resolved preview URL
- chosen agent id
- unpaid challenge payload
- paid execute response
- decoded x402 payment response when present
- task receipt JSON
- task activity feed JSON
- screenshots for the agent passport and task receipt pages when capture is enabled

## Merge Gate For The Week 2 Branch

Before merging the x402 branch:

1. `preview-smoke` must pass for the branch SHA
2. `preview-live-x402` must pass once against the same preview line
3. review the uploaded artifacts and confirm the paid task receipt is linked from the canonical public surface

This is intentionally stricter than the normal read-only preview gate because Week 2 adds a public paid execution route.
