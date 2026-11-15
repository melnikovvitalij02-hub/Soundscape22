/*
# Add cancel_premium SECURITY DEFINER function

## Problem
SubscriptionPage.tsx calls `supabase.from('profiles').update({ is_premium: false })` directly
from the client to cancel premium. After the column-level lock-down (is_premium is no longer
client-writable), this call will fail silently. We need a privileged function to perform the
cancellation.

## Changes
- Create `cancel_premium()` SECURITY DEFINER function that:
  - Derives caller from `auth.uid()`.
  - Sets `is_premium = false` on the caller's profile.
  - Updates the caller's subscription row to status='cancelled', tier='free'.
- Revoke EXECUTE from anon, grant to authenticated.
*/

CREATE OR REPLACE FUNCTION cancel_premium()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE profiles SET is_premium = false, updated_at = now() WHERE id = v_user;

  UPDATE subscriptions
  SET status = 'cancelled', tier = 'free'
  WHERE user_id = v_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_premium() FROM anon;
GRANT EXECUTE ON FUNCTION cancel_premium() TO authenticated;
