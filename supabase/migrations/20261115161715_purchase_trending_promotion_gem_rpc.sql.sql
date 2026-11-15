/*
# Pay for trending promotions with Gem from balance

1. Purpose
- Trending promotions (boosts) are now paid ONLY with Gem (donate coins) at
  fixed prices: basic 300, plus 750, max 1800, top3 5500. The old YooMoney
  flow for boosts is removed; the client now calls a single RPC that checks
  availability, debits Gem atomically and inserts the promotion row.

2. New Functions
- `purchase_trending_promotion(p_beat_id uuid, p_kind text)` (SECURITY DEFINER)
  - Validates authenticated user.
  - Maps kind -> Gem price / boost points / duration (basic 300, plus 750,
    max 1800, top3 5500). 'eternal' is NOT supported anymore.
  - Advisory lock, checks the beat belongs to the caller and is public.
  - Top-3: rejects if the beat is already in top-3 or all 3 slots are full.
  - Locks the profile FOR UPDATE, checks Gem (donate_coins) balance,
    debits Gem, inserts into trending_promotions, records a succeeded
    payments row (label `balance_promo_...`) for purchase history.
  - Returns jsonb {ok, message, expires_at} or {ok:false, reason}
    with reasons: not_authenticated, bad_kind, beat_not_found,
    already_top3, top3_full, no_profile, insufficient.

3. Security
- REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated.
- Search path pinned; RLS is bypassed intentionally inside the definer
  function which enforces its own ownership and balance checks.
*/

CREATE OR REPLACE FUNCTION public.purchase_trending_promotion(p_beat_id uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_price integer;
  v_points integer := 0;
  v_duration interval;
  v_expires timestamptz;
  v_active_top3 integer;
  v_balance integer;
  v_payment_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  CASE p_kind
    WHEN 'boost_basic' THEN v_price := 300; v_points := 100; v_duration := interval '24 hours';
    WHEN 'boost_plus' THEN v_price := 750; v_points := 250; v_duration := interval '24 hours';
    WHEN 'boost_max' THEN v_price := 1800; v_points := 600; v_duration := interval '24 hours';
    WHEN 'top3' THEN v_price := 5500; v_duration := interval '24 hours';
    ELSE
      RETURN jsonb_build_object('ok', false, 'reason', 'bad_kind');
  END CASE;

  PERFORM pg_advisory_xact_lock(hashtext('trending_promotions'));

  IF NOT EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = v_user AND is_public) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beat_not_found');
  END IF;

  IF p_kind = 'top3' THEN
    IF EXISTS (SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'top3' AND expires_at > now()) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_top3');
    END IF;
    SELECT count(*) INTO v_active_top3 FROM trending_promotions WHERE kind = 'top3' AND expires_at > now();
    IF v_active_top3 >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'top3_full');
    END IF;
  END IF;

  SELECT donate_coins INTO v_balance FROM profiles WHERE id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
  END IF;

  UPDATE profiles SET donate_coins = donate_coins - v_price, updated_at = now() WHERE id = v_user;

  v_expires := now() + v_duration;

  INSERT INTO trending_promotions (beat_id, user_id, kind, price_coins, boost_points, expires_at)
  VALUES (p_beat_id, v_user, p_kind, v_price, v_points, v_expires);

  INSERT INTO payments (user_id, amount, status, label, payment_type, yoomoney_operation_id)
  VALUES (
    v_user,
    0,
    'succeeded',
    'balance_promo_' || p_kind || '_' || p_beat_id::text || '_' || v_user::text || '_r0',
    'shop',
    'balance_gem'
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Продвижение активировано', 'expires_at', v_expires, 'payment_id', v_payment_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_trending_promotion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_trending_promotion(uuid, text) TO authenticated;
