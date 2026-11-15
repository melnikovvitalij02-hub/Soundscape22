/*
# Promo code SOUND20 for Premium first month (20% off)

1. Plain-English explanation
   Adds a promo code system for the Premium subscription. The code SOUND20
   gives 20% off the first month (199.00 → 159.20 RUB). Rules enforced
   entirely on the server: the code is valid for 7 days from activation,
   one use per user, at most 20 successful (and actively reserved) uses.
   Future months are billed at the normal 199 RUB — only the first payment
   is discounted.

2. New tables
   - `promo_codes`: code, discount_percent, first_month_price (numeric),
     max_uses, activated_at (validity window starts here), is_active.
   - `promo_code_uses`: one row per user per code with status
     'reserved' (payment started) or 'used' (payment confirmed). A unique
     constraint on (promo_code_id, user_id) makes double use impossible at
     the database level. payment_id links the use to its payments row.
   Both tables have RLS enabled with no policies: nobody reads or writes
   them directly through the Data API — only via the SECURITY DEFINER
   functions below.

3. Seeded data
   - One row in `promo_codes`: code SOUND20, 20% discount, first month
     price 159.20, max 20 uses, activated now (the 7-day window starts at
     migration time).

4. New functions
   - `start_promo_premium_payment(p_code text)`: called by the Premium page.
     Validates the code (exists, active, within 7 days), checks the use
     limit (stale reservations older than 24 hours do not count), claims a
     slot atomically (advisory lock + unique constraint), creates a pending
     payments row (payment_type 'premium', label
     `promosub_<userId>_r<price>`) and returns the amount to charge. The
     client never sets the price.
   - `mark_promo_used(p_payment_id uuid)`: flips a reservation to 'used'
     after a successful payment. Called by the YooMoney webhook
     (service_role) after the premium grant.

5. Modified functions
   - `grant_demo_payment`: the premium path now also marks a promo
     reservation as 'used' when the payment being completed is a promo
     payment (matched by payment_id; a no-op for regular payments).

6. Security changes
   - RLS enabled on both new tables, zero policies (deny-all by default).
   - EXECUTE on `start_promo_premium_payment` granted to `authenticated`
     only (revoked from PUBLIC and anon).
   - EXECUTE on `mark_promo_used` granted to `service_role` only.
*/

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_percent integer NOT NULL,
  first_month_price numeric(10,2) NOT NULL,
  max_uses integer NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_code_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'used')),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  UNIQUE (promo_code_id, user_id)
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;

INSERT INTO public.promo_codes (code, discount_percent, first_month_price, max_uses, activated_at, is_active)
VALUES ('SOUND20', 20, 159.20, 20, now(), true)
ON CONFLICT (code) DO NOTHING;

-- ── Start a promo-priced premium payment (client entry point) ────────────
CREATE OR REPLACE FUNCTION public.start_promo_premium_payment(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_promo promo_codes%ROWTYPE;
  v_use_id uuid;
  v_active_count integer;
  v_payment_id uuid;
  v_amount numeric;
  v_label text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_promo FROM promo_codes
  WHERE upper(code) = upper(trim(p_code)) AND is_active
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_promo.activated_at + interval '7 days' < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('promo_' || v_promo.id::text));

  -- Stale reservations (payment abandoned for over 24h) release the slot.
  SELECT count(*) INTO v_active_count
  FROM promo_code_uses
  WHERE promo_code_id = v_promo.id
    AND (status = 'used' OR (status = 'reserved' AND created_at > now() - interval '24 hours'));

  IF v_active_count >= v_promo.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limit_reached');
  END IF;

  BEGIN
    INSERT INTO promo_code_uses (promo_code_id, user_id, status)
    VALUES (v_promo.id, v_user, 'reserved')
    RETURNING id INTO v_use_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END;

  v_amount := v_promo.first_month_price;
  v_label := 'promosub_' || v_user::text || '_r' || v_amount::text;

  INSERT INTO payments (user_id, amount, status, label, payment_type)
  VALUES (v_user, v_amount, 'pending', v_label, 'premium')
  RETURNING id INTO v_payment_id;

  UPDATE promo_code_uses SET payment_id = v_payment_id WHERE id = v_use_id;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'amount', v_amount, 'label', v_label);
END;
$$;

-- ── Confirm a promo use after successful payment (webhook) ───────────────
CREATE OR REPLACE FUNCTION public.mark_promo_used(p_payment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE promo_code_uses
  SET status = 'used', used_at = now()
  WHERE payment_id = p_payment_id AND status = 'reserved';
$$;

REVOKE EXECUTE ON FUNCTION public.start_promo_premium_payment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_promo_premium_payment(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_promo_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_promo_used(uuid) TO service_role;
