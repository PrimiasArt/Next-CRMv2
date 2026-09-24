-- Add invite_code column to profiles for first-login verification
-- When admin creates an account, invite_code is set.
-- After employee verifies on first login, invite_code is cleared to NULL.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code text;
