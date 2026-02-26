-- Add suspension metadata directly on users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

