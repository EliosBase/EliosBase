-- Add EAS attestation columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS eas_attestation_uid TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS eas_attestation_tx TEXT;
