/*
# Secure Payment System: column-level locks + SECURITY DEFINER premium grant

## Problem
The `profiles` table allowed any authenticated user to UPDATE ALL columns on their own row,
including `is_premium`, `premium_expires_at`, `coins`, `donate_coins`, `earned_coins`,
`total_donate_purchased`, `xp`, and `level`. This meant a user could grant themselves premium
status, infinite coins, or arbitrary XP/level by calling the Supabase data API directly —
no payment required. PaymentSuccessPage.tsx was also writing `is_premium` directly from the
client, which is a privilege escalation.

## Changes

### 1. Column-level UPDATE grants on profiles
Revoke the table-wide UPDATE grant from `authenticated` and re-grant UPDATE only on the
columns a user may legitimately edit: `username`, `avatar_url`, `bio`, `is_online`,
`last_seen`, `updated_at`. All privilege/balance columns (`is_premium`,
`premium_expires_at`, `coins`, `donate_coins`, `earned_coins`,
`total_donate_purchased`, `xp`, `level`) are no longer client-writable.

### 2. SECURITY DEFINER function: grant_premium_for_payment
A privileged function that the client calls after a YooMoney redirect. It:
  - Derives the caller from `auth.uid()` (never from a parameter).
  - Looks up the caller's most recent payment with label starting `subscription_` and
    status `succeeded`.
  - If found, grants 30-day premium (sets `is_premium = true`, `premium_expires_at`).
  - If not found, returns `{ granted: false, reason: 'no_succeeded_payment' }` so the
    client can keep polling (webhook may still be processing).
  - Returns `{ granted: true }` on success.

This replaces the client-side `profiles.update({ is_premium: true })` calls.

### 3. Drop redundant/over-permissive policies
Drop `update_own_premium` policy (now unnecessary — premium is granted only via the
SECURITY DEFINER function, and the column grant is revoked).

## Security
- `profiles` UPDATE narrowed to safe columns only.
- `grant_premium_for_payment` is SECURITY DEFINER, SET search_path = public, EXECUTE
  revoked from anon, granted to authenticated.
- The function only reads payments + writes profiles; it does not trust any client-
  supplied value for the grant decision.
*/

-- ── 1. Column-level UPDATE on profiles ──────────────────────────────
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (username, avatar_url, bio, is_online, last_seen, updated_at) ON profiles TO authenticated;

-- Also narrow anon (anon has full grants from earlier migrations; revoke UPDATE entirely)
REVOKE UPDATE ON profiles FROM anon;
-- anon should not update profiles at all; if online-status is needed for anon, it's not.

-- Drop the now-unnecessary over-permissive update_own_premium policy
DROP POLICY IF EXISTS "update_own_premium" ON profiles;

-- ── 2. SECURITY DEFINER: grant_premium_for_payment ──────────────────
CREATE OR REPLACE FUNCTION grant_premium_for_payment()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_payment RECORD;
  v_expires timestamptz;
  v_current_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  END IF;

  -- Find the most recent succeeded subscription payment for this user
  SELECT id, label, amount, status
  INTO v_payment
  FROM payments
  WHERE user_id = v_user
    AND label LIKE 'subscription_%'
    AND status = 'succeeded'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_succeeded_payment');
  END IF;

  -- Check current premium state — extend from existing expiry if still active
  SELECT premium_expires_at INTO v_current_expires
  FROM profiles WHERE id = v_user;

  IF v_current_expires IS NOT NULL AND v_current_expires > now() THEN
    v_expires := v_current_expires + interval '30 days';
  ELSE
    v_expires := now() + interval '30 days';
  END IF;

  UPDATE profiles
  SET is_premium = true,
      premium_expires_at = v_expires,
      updated_at = now()
  WHERE id = v_user;

  -- Also ensure subscriptions table reflects this
  INSERT INTO subscriptions (user_id, status, plan, tier, started_at, expires_at)
  VALUES (v_user, 'active', 'premium', 'premium', now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE
  SET status = 'active', plan = 'premium', tier = 'premium',
      started_at = now(), expires_at = v_expires;

  RETURN jsonb_build_object('granted', true, 'expires_at', v_expires);
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_premium_for_payment() FROM anon;
GRANT EXECUTE ON FUNCTION grant_premium_for_payment() TO authenticated;
