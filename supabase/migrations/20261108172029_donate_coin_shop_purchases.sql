/*
# Donate coin shop: server-side sample pack purchases and locked donate balance

1. Changes
- `sample_packs` gets a `currency` column. Sample packs are sold for donate coins only ('donate'). The price in `price_coins` is read as donate coins for these rows.
- New function `purchase_sample_pack(p_pack_id)`: checks the pack is donate-priced, checks the user does not already own it, deducts donate coins atomically and records the purchase. Runs on the server so the price cannot be changed by the browser.

2. Security
- Direct inserts into `user_sample_packs` are removed. Before this, a signed-in user could add a sample pack to their library for free.
- Direct inserts into `sample_packs` are removed. Only the database owner adds packs now.
- `change_donate_coins` is no longer callable by signed-in users. Previously anyone could grant themselves donate coins. Donate coins are credited only by the payment webhook.

3. Notes
- Sticker chests and the other shop items keep using game coins.
- Game coins (`change_coins`) remain callable by the client for now; that is tracked separately.
*/

ALTER TABLE public.sample_packs ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'donate';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sample_packs'::regclass AND conname = 'sample_packs_currency_check'
  ) THEN
    ALTER TABLE public.sample_packs
      ADD CONSTRAINT sample_packs_currency_check CHECK (currency IN ('game', 'donate'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.purchase_sample_pack(p_pack_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pack public.sample_packs%ROWTYPE;
  v_balance integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_pack FROM public.sample_packs WHERE id = p_pack_id;
  IF v_pack.id IS NULL THEN
    RAISE EXCEPTION 'Sample pack not found';
  END IF;
  IF v_pack.currency <> 'donate' THEN
    RAISE EXCEPTION 'Sample pack is not sold for donate coins';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_sample_packs
    WHERE user_id = v_user AND sample_pack_id = p_pack_id
  ) THEN
    RAISE EXCEPTION 'Sample pack already owned';
  END IF;

  UPDATE public.profiles
  SET donate_coins = donate_coins - v_pack.price_coins,
      updated_at = now()
  WHERE id = v_user AND donate_coins >= v_pack.price_coins
  RETURNING donate_coins INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient donate coins';
  END IF;

  INSERT INTO public.user_sample_packs (user_id, sample_pack_id, purchased_at)
  VALUES (v_user, p_pack_id, now());

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_sample_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_sample_pack(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.change_donate_coins(integer, text) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "user_sample_packs_insert_own" ON public.user_sample_packs;
DROP POLICY IF EXISTS "sample_packs_insert_own" ON public.sample_packs;
