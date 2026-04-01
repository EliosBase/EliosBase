-- Farcaster managed signers table
CREATE TABLE IF NOT EXISTS farcaster_signers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fid BIGINT NOT NULL,
  signer_uuid TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'revoked')),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fc_signers_user ON farcaster_signers (user_id);
CREATE INDEX IF NOT EXISTS idx_fc_signers_fid ON farcaster_signers (fid);

ALTER TABLE farcaster_signers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_fc_signers" ON farcaster_signers;
CREATE POLICY "deny_anon_fc_signers" ON farcaster_signers FOR ALL USING (false);

-- Add cast hash column to tasks for tracking auto-casts
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fc_cast_hash TEXT;
