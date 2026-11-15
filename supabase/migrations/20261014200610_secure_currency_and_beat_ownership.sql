/*
# Secure currency and beat ownership

1. Currency protection
- Reset balances above 100000 coins to 0 once, preserving a clean state.
- Add a 0..100000 balance constraint.
- Revoke direct client updates to coins, XP, and level.
- Add server-owned SECURITY DEFINER functions for atomic coin and XP changes.

2. Beat ownership
- Keep beat update and delete operations restricted to the authenticated owner.
- Public feed reads only beats marked public through the existing application filter.

3. Security
- Currency mutations derive the actor from auth.uid().
- Functions use a fixed search_path and are not executable by anon.
- Existing user data is retained except balances proven to be inflated above the safety limit, which are reset to 0 as requested.
*/

UPDATE profiles SET coins = 0 WHERE coins > 100000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_coins_bounds'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_coins_bounds CHECK (coins BETWEEN 0 AND 100000);
  END IF;
END $$;

REVOKE UPDATE (coins, xp, level) ON profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.change_coins(p_amount integer, p_reason text DEFAULT 'system')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_amount IS NULL OR p_amount < -10000 OR p_amount > 10000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  UPDATE profiles
  SET coins = coins + p_amount
  WHERE id = auth.uid()
    AND coins + p_amount BETWEEN 0 AND 100000
  RETURNING coins INTO v_balance;

  IF v_balance IS NULL THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  IF p_amount <> 0 THEN
    INSERT INTO coin_transactions (user_id, amount, transaction_type, description)
    VALUES (auth.uid(), p_amount, 'server_adjustment', left(p_reason, 200));
  END IF;

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_xp(p_amount integer)
RETURNS TABLE(new_xp integer, new_level integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount > 10000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  RETURN QUERY
  UPDATE profiles
  SET xp = xp + p_amount,
      level = floor((xp + p_amount)::numeric / 500)::integer + 1
  WHERE id = auth.uid()
  RETURNING profiles.xp, profiles.level;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_coins(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_coins(integer, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.change_xp(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_xp(integer) TO authenticated;

ALTER TABLE beats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beats_update_own" ON beats;
CREATE POLICY "beats_update_own" ON beats FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "beats_delete_own" ON beats;
CREATE POLICY "beats_delete_own" ON beats FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
