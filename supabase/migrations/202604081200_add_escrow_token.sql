-- Add escrow token column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS escrow_token TEXT DEFAULT 'ETH';
