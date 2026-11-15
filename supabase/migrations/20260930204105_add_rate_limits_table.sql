/*
# Add rate_limits table for anti-abuse protection

## Summary
Creates a table to track and enforce rate limits on user actions (login attempts,
API calls, game actions, etc.) to protect against DDoS and brute-force attacks.
The rate-limit edge function reads and writes this table.

## New Tables
- `rate_limits`
  - id (uuid, PK)
  - identifier (text) — IP address or user ID
  - action (text) — action type (e.g. 'login', 'signup', 'game_action')
  - count (int) — number of requests in current window
  - window_start (timestamptz) — start of the current time window
  - updated_at (timestamptz)

## Security
- RLS enabled — only the service role (edge functions) can read/write
- No anon or authenticated access — this is server-side only
*/

CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action text NOT NULL,
  count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(identifier, action)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_action ON rate_limits(identifier, action);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);