-- Add Farcaster identity columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS fid BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fc_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fc_pfp_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fc_linked_at TIMESTAMPTZ;

-- Unique partial index: one FID per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fid
  ON users (fid)
  WHERE fid IS NOT NULL;
