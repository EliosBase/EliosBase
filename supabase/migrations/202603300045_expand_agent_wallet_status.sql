ALTER TABLE agents
  DROP CONSTRAINT IF EXISTS agents_wallet_status_check;

ALTER TABLE agents
  ADD CONSTRAINT agents_wallet_status_check
  CHECK (wallet_status IN ('predicted', 'active', 'migrating', 'ready', 'failed'));
