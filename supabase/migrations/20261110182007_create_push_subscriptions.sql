/*
# Add Web Push subscriptions and VAPID keys

Lets the app show a system notification on a user's phone when someone calls them,
even when the app is closed.

1. New Tables
- `push_subscriptions`: one row per browser/device that agreed to receive notifications.
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `endpoint` (text, unique push service address of the device)
  - `p256dh` and `auth_key` (text, encryption keys for the push message)
  - `created_at` (timestamp)
- `push_vapid_keys`: single-row store for the server's push signing key pair.
  Generated once by the server function and reused afterwards. Never readable by app users.

2. Security
- RLS enabled on both tables.
- `push_subscriptions`: signed-in users can read, add, update and remove only their own rows.
- `push_vapid_keys`: no policies and no access for `anon` or `authenticated`; only `service_role` (server function) can use it.

3. Important Notes
- The server function reads subscriptions of the callee with the service role and removes expired device subscriptions.
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT SELECT, DELETE ON push_subscriptions TO service_role;

DROP POLICY IF EXISTS "select_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "select_own_push_subscriptions" ON push_subscriptions FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "insert_own_push_subscriptions" ON push_subscriptions FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "update_own_push_subscriptions" ON push_subscriptions FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_subscriptions" ON push_subscriptions;
CREATE POLICY "delete_own_push_subscriptions" ON push_subscriptions FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS push_vapid_keys (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_vapid_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON push_vapid_keys FROM anon, authenticated;
GRANT SELECT, INSERT ON push_vapid_keys TO service_role;
