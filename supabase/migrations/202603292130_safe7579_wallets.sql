ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS wallet_standard TEXT CHECK (wallet_standard IN ('safe', 'safe7579')),
  ADD COLUMN IF NOT EXISTS wallet_revision INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS wallet_migration_state TEXT CHECK (wallet_migration_state IN ('legacy', 'pending', 'migrated', 'failed')),
  ADD COLUMN IF NOT EXISTS wallet_modules JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS session_key_address TEXT,
  ADD COLUMN IF NOT EXISTS session_key_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS session_key_nonce TEXT,
  ADD COLUMN IF NOT EXISTS session_key_tag TEXT,
  ADD COLUMN IF NOT EXISTS session_key_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_key_rotated_at TIMESTAMPTZ;

UPDATE agents
SET
  wallet_standard = COALESCE(wallet_standard, wallet_kind, 'safe'),
  wallet_migration_state = COALESCE(
    wallet_migration_state,
    CASE
      WHEN COALESCE(wallet_standard, wallet_kind, 'safe') = 'safe7579' THEN 'migrated'
      ELSE 'legacy'
    END
  );

ALTER TABLE agents
  ALTER COLUMN wallet_standard SET DEFAULT 'safe',
  ALTER COLUMN wallet_migration_state SET DEFAULT 'legacy';

ALTER TABLE agent_wallet_transfers
  ADD COLUMN IF NOT EXISTS execution_mode TEXT CHECK (execution_mode IN ('session', 'owner', 'reviewed')),
  ADD COLUMN IF NOT EXISTS intent_hash TEXT,
  ADD COLUMN IF NOT EXISTS user_op_hash TEXT,
  ADD COLUMN IF NOT EXISTS policy_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;
