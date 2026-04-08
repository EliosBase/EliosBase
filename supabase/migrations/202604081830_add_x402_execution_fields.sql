ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS x402_price_usd TEXT;

UPDATE agents
SET x402_price_usd = COALESCE(NULLIF(x402_price_usd, ''), '$0.05');

ALTER TABLE agents
  ALTER COLUMN x402_price_usd SET DEFAULT '$0.05';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_network TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_task_id ON transactions (task_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions (agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_reference ON transactions (payment_reference);
