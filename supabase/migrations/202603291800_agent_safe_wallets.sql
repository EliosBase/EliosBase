ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_kind TEXT CHECK (wallet_kind IN ('safe')),
  ADD COLUMN IF NOT EXISTS wallet_status TEXT CHECK (wallet_status IN ('predicted', 'active')),
  ADD COLUMN IF NOT EXISTS wallet_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE agents
SET
  wallet_kind = COALESCE(wallet_kind, 'safe'),
  wallet_status = COALESCE(wallet_status, 'predicted')
WHERE wallet_kind IS NULL OR wallet_status IS NULL;

ALTER TABLE agents
  ALTER COLUMN wallet_kind SET DEFAULT 'safe',
  ALTER COLUMN wallet_status SET DEFAULT 'predicted';

CREATE TABLE IF NOT EXISTS agent_wallet_transfers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  safe_address TEXT NOT NULL,
  destination TEXT NOT NULL,
  amount_eth TEXT NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('blocked', 'queued', 'approved', 'executed')),
  policy_reason TEXT,
  approvals_required INT NOT NULL DEFAULT 1,
  approvals_received INT NOT NULL DEFAULT 0,
  unlock_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_wallet_transfers_agent ON agent_wallet_transfers (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_wallet_transfers_status ON agent_wallet_transfers (status, created_at DESC);

ALTER TABLE agent_wallet_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_agent_wallet_transfers" ON agent_wallet_transfers;
CREATE POLICY "deny_anon_agent_wallet_transfers" ON agent_wallet_transfers FOR ALL USING (false);
