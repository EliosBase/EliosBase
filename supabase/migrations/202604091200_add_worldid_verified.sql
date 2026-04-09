-- Add World ID verification status to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS worldid_verified BOOLEAN DEFAULT false;
