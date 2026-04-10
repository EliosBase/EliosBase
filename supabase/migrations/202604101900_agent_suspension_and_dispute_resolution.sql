-- Agent suspension + dispute resolution tracking
-- Part of: feature/dispute-timeout-suspension
--
-- Adds:
-- 1. 'suspended' to agents.status check constraint
-- 2. agents.suspended_at, agents.suspended_reason for audit trail
-- 3. security_alerts.resolution, resolved_at, resolved_by for dispute outcomes

-- ─── Agents: suspension ─────────────────────────────────────────
ALTER TABLE agents
  DROP CONSTRAINT IF EXISTS agents_status_check;

ALTER TABLE agents
  ADD CONSTRAINT agents_status_check
  CHECK (status IN ('online', 'busy', 'offline', 'suspended'));

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status);

-- ─── Security Alerts: resolution metadata ───────────────────────
ALTER TABLE security_alerts
  ADD COLUMN IF NOT EXISTS resolution TEXT
    CHECK (resolution IS NULL OR resolution IN ('refund', 'release', 'dismiss')),
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_alerts_source ON security_alerts (source);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON security_alerts (resolved);
