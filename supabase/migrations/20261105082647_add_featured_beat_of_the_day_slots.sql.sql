/*
# Featured Beat of the Day: paid spotlight slots

1. New table: featured_beat_slots
- `id` (uuid, primary key)
- `slot_date` (date, unique): the day the beat is featured on the home page
- `beat_id` (uuid): the beat shown that day, cascades on beat deletion
- `user_id` (uuid): the producer who paid for the slot
- `price_coins` (integer): the price charged at purchase time
- `created_at` (timestamptz)

2. New function: buy_featured_beat_slot(p_beat_id, p_slot_date)
- Buyer is taken from auth.uid(), never from the browser.
- The beat must belong to the buyer and be public.
- The date must be today or within the next 7 days (server date).
- Each day can be booked once; a second booking for the same day is rejected.
- Charges 150 coins through the existing change_coins function. If the balance is too low, the slot insert is rolled back too.

3. Security
- RLS enabled. Anyone (anon and authenticated) can read slots because the spotlight is public.
- No direct insert, update or delete grants: slots can only be created through the purchase function.
- The purchase function is executable by authenticated users only.
*/

CREATE TABLE IF NOT EXISTS public.featured_beat_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date date NOT NULL UNIQUE,
  beat_id uuid NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_coins integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS featured_beat_slots_beat_id_idx ON public.featured_beat_slots (beat_id);
CREATE INDEX IF NOT EXISTS featured_beat_slots_user_id_idx ON public.featured_beat_slots (user_id);

ALTER TABLE public.featured_beat_slots ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.featured_beat_slots TO anon, authenticated;

DROP POLICY IF EXISTS "public_select_featured_slots" ON public.featured_beat_slots;
CREATE POLICY "public_select_featured_slots" ON public.featured_beat_slots
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.buy_featured_beat_slot(p_beat_id uuid, p_slot_date date)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price constant integer := 150;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF p_slot_date IS NULL OR p_slot_date < CURRENT_DATE OR p_slot_date > CURRENT_DATE + 7 THEN
    RAISE EXCEPTION 'Date is outside the booking window';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = auth.uid() AND is_public = true
  ) THEN
    RAISE EXCEPTION 'Beat is not available';
  END IF;

  IF EXISTS (SELECT 1 FROM featured_beat_slots WHERE slot_date = p_slot_date) THEN
    RAISE EXCEPTION 'Slot already taken';
  END IF;

  INSERT INTO featured_beat_slots (slot_date, beat_id, user_id, price_coins)
  VALUES (p_slot_date, p_beat_id, auth.uid(), v_price);

  PERFORM public.change_coins(-v_price, 'Бит дня: ' || to_char(p_slot_date, 'DD.MM.YYYY'));

  RETURN p_slot_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buy_featured_beat_slot(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_featured_beat_slot(uuid, date) TO authenticated;
