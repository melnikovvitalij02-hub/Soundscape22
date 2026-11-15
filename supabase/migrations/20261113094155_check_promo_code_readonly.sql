/*
# Read-only promo code preview check

1. Plain-English explanation
   The Premium page has an "Apply" button next to the promo code field. It
   needs to show the user whether the code is valid and what the discounted
   price will be — WITHOUT claiming a use slot (the slot is only claimed
   when the user actually starts the payment via start_promo_premium_payment).
   Adds `check_promo_code(p_code text)`: a read-only validator returning the
   discounted amount and discount percent, or a reason code
   (not_found / expired / limit_reached / already_used / not_authenticated).
   The same stale-reservation rule applies: reservations older than 24 hours
   do not count toward the limit.

2. New functions
   - `check_promo_code(text)`: read-only, SECURITY DEFINER.

3. Security changes
   - EXECUTE granted to `authenticated` only (revoked from PUBLIC and anon).
*/

CREATE OR REPLACE FUNCTION public.check_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_promo promo_codes%ROWTYPE;
  v_active_count integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_promo FROM promo_codes
  WHERE upper(code) = upper(trim(p_code)) AND is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_promo.activated_at + interval '7 days' < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF EXISTS (
    SELECT 1 FROM promo_code_uses
    WHERE promo_code_id = v_promo.id AND user_id = v_user
      AND (status = 'used' OR (status = 'reserved' AND created_at > now() - interval '24 hours'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;

  SELECT count(*) INTO v_active_count
  FROM promo_code_uses
  WHERE promo_code_id = v_promo.id
    AND (status = 'used' OR (status = 'reserved' AND created_at > now() - interval '24 hours'));

  IF v_active_count >= v_promo.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limit_reached');
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_promo.first_month_price, 'discount_percent', v_promo.discount_percent);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_promo_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_promo_code(text) TO authenticated;
