/*
# Trending tracks: paid boosts, top-3 placement and eternal boost

1. New Tables
- `trending_promotions`: one row per purchased promotion.
  - `id` (uuid, primary key)
  - `beat_id` (uuid, the promoted beat)
  - `user_id` (uuid, the buyer, defaults to the signed-in user)
  - `kind` (text): `boost_basic` (50 coins), `boost_plus` (100), `boost_max` (200), `top3` (500), `eternal` (2000)
  - `price_coins` (integer), `boost_points` (integer, score added while a boost is active)
  - `created_at` (timestamptz), `expires_at` (timestamptz, null for eternal)

2. New Functions
- `buy_trending_promotion(p_beat_id, p_kind)`: validates ownership and slot limits, records the promotion, then charges coins through `change_coins`. Returns the expiry time (null for eternal).
- `get_trending_beats(p_limit)`: returns public beats in ranked order with score, likes, boost info and pinned positions.

3. Ranking Rules
- Score = play count + 3 x likes + points from active 24h boosts.
- Positions 1-3 go to active top-3 placements, in purchase order.
- Positions 4-10 are reserved for eternal boosts, in purchase order.
- All other beats fill the remaining positions by score.

4. Limits
- At most 3 top-3 placements can be active at once.
- At most 7 eternal boosts exist in total (they occupy positions 4-10).
- A beat can hold only one active top-3 placement and one eternal boost.

5. Security Changes
- RLS enabled on `trending_promotions`.
- Read access granted to `anon` and `authenticated` on public columns only; the buyer id is not exposed.
- Select policy allows reading promotions (they are public badges).
- No insert, update, or delete grants: all writes go through the purchase function.
- The purchase function is SECURITY DEFINER, requires a signed-in user, and is executable only by `authenticated`.

6. Notes
- Purchases are serialized with an advisory lock so two buyers cannot take the last slot at once.
- The migration is idempotent and safe to re-run.
*/

CREATE TABLE IF NOT EXISTS trending_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('boost_basic', 'boost_plus', 'boost_max', 'top3', 'eternal')),
  price_coins integer NOT NULL CHECK (price_coins > 0),
  boost_points integer NOT NULL DEFAULT 0 CHECK (boost_points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS trending_promotions_beat_id_idx ON trending_promotions (beat_id);
CREATE INDEX IF NOT EXISTS trending_promotions_user_id_idx ON trending_promotions (user_id);
CREATE INDEX IF NOT EXISTS trending_promotions_kind_expires_idx ON trending_promotions (kind, expires_at);

ALTER TABLE trending_promotions ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON trending_promotions FROM anon, authenticated;
GRANT SELECT (id, beat_id, kind, price_coins, boost_points, created_at, expires_at) ON trending_promotions TO anon, authenticated;

DROP POLICY IF EXISTS "trending_promotions_select_all" ON trending_promotions;
CREATE POLICY "trending_promotions_select_all" ON trending_promotions FOR SELECT
  TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION buy_trending_promotion(p_beat_id uuid, p_kind text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_price integer;
  v_points integer := 0;
  v_duration interval;
  v_expires timestamptz;
  v_active_top3 integer;
  v_eternal_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  CASE p_kind
    WHEN 'boost_basic' THEN v_price := 50; v_points := 100; v_duration := interval '24 hours';
    WHEN 'boost_plus' THEN v_price := 100; v_points := 250; v_duration := interval '24 hours';
    WHEN 'boost_max' THEN v_price := 200; v_points := 600; v_duration := interval '24 hours';
    WHEN 'top3' THEN v_price := 500; v_duration := interval '24 hours';
    WHEN 'eternal' THEN v_price := 2000;
    ELSE RAISE EXCEPTION 'Unknown promotion';
  END CASE;

  PERFORM pg_advisory_xact_lock(hashtext('trending_promotions'));

  IF NOT EXISTS (SELECT 1 FROM beats WHERE id = p_beat_id AND user_id = v_uid AND is_public) THEN
    RAISE EXCEPTION 'Beat not found';
  END IF;

  IF p_kind = 'top3' THEN
    IF EXISTS (
      SELECT 1 FROM trending_promotions
      WHERE beat_id = p_beat_id AND kind = 'top3' AND expires_at > now()
    ) THEN
      RAISE EXCEPTION 'Already in top-3';
    END IF;
    SELECT count(*) INTO v_active_top3
    FROM trending_promotions
    WHERE kind = 'top3' AND expires_at > now();
    IF v_active_top3 >= 3 THEN RAISE EXCEPTION 'Top-3 slots are full'; END IF;
  ELSIF p_kind = 'eternal' THEN
    IF EXISTS (
      SELECT 1 FROM trending_promotions WHERE beat_id = p_beat_id AND kind = 'eternal'
    ) THEN
      RAISE EXCEPTION 'Already has eternal boost';
    END IF;
    SELECT count(*) INTO v_eternal_count FROM trending_promotions WHERE kind = 'eternal';
    IF v_eternal_count >= 7 THEN RAISE EXCEPTION 'Eternal slots are full'; END IF;
  END IF;

  IF v_duration IS NULL THEN
    v_expires := NULL;
  ELSE
    v_expires := now() + v_duration;
  END IF;

  INSERT INTO trending_promotions (beat_id, user_id, kind, price_coins, boost_points, expires_at)
  VALUES (p_beat_id, v_uid, p_kind, v_price, v_points, v_expires);

  PERFORM change_coins(-v_price, 'trending_' || p_kind);

  RETURN v_expires;
END;
$$;

REVOKE EXECUTE ON FUNCTION buy_trending_promotion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION buy_trending_promotion(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION get_trending_beats(p_limit integer DEFAULT 50)
RETURNS TABLE (
  rank_position integer,
  beat_id uuid,
  creator_id uuid,
  title text,
  genre text,
  bpm integer,
  cover_url text,
  data jsonb,
  play_count integer,
  likes_count bigint,
  boost_points bigint,
  score bigint,
  top3_until timestamptz,
  boost_until timestamptz,
  is_eternal boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH active_promos AS (
    SELECT tp.beat_id, tp.kind, tp.boost_points, tp.created_at, tp.expires_at
    FROM trending_promotions tp
    WHERE tp.kind = 'eternal' OR tp.expires_at > now()
  ),
  like_counts AS (
    SELECT bl.beat_id, count(*) AS cnt FROM beat_likes bl GROUP BY bl.beat_id
  ),
  boost_totals AS (
    SELECT ap.beat_id, sum(ap.boost_points) AS pts, max(ap.expires_at) AS until
    FROM active_promos ap
    WHERE ap.kind IN ('boost_basic', 'boost_plus', 'boost_max')
    GROUP BY ap.beat_id
  ),
  top3_slots AS (
    SELECT ap.beat_id, ap.expires_at AS until,
      row_number() OVER (ORDER BY ap.created_at) AS pos
    FROM active_promos ap
    WHERE ap.kind = 'top3'
  ),
  eternal_slots AS (
    SELECT ap.beat_id, row_number() OVER (ORDER BY ap.created_at) AS pos
    FROM active_promos ap
    WHERE ap.kind = 'eternal'
      AND ap.beat_id NOT IN (SELECT t3.beat_id FROM top3_slots t3)
  ),
  scored AS (
    SELECT b.id AS b_id,
      b.user_id AS b_user_id,
      b.title AS b_title,
      b.genre AS b_genre,
      b.bpm AS b_bpm,
      b.cover_url AS b_cover_url,
      b.data AS b_data,
      b.play_count AS b_play_count,
      b.created_at AS b_created_at,
      coalesce(lc.cnt, 0) AS s_likes,
      coalesce(bt.pts, 0) AS s_boost_points,
      (coalesce(b.play_count, 0) + 3 * coalesce(lc.cnt, 0) + coalesce(bt.pts, 0))::bigint AS s_score,
      t3.until AS s_top3_until,
      bt.until AS s_boost_until,
      EXISTS (SELECT 1 FROM active_promos ap WHERE ap.beat_id = b.id AND ap.kind = 'eternal') AS s_is_eternal,
      t3.pos AS s_top3_pos,
      et.pos AS s_eternal_pos
    FROM beats b
    LEFT JOIN like_counts lc ON lc.beat_id = b.id
    LEFT JOIN boost_totals bt ON bt.beat_id = b.id
    LEFT JOIN top3_slots t3 ON t3.beat_id = b.id
    LEFT JOIN eternal_slots et ON et.beat_id = b.id
    WHERE b.is_public
  ),
  placed AS (
    SELECT s.*,
      CASE
        WHEN s.s_top3_pos IS NOT NULL THEN s.s_top3_pos
        WHEN s.s_eternal_pos IS NOT NULL THEN 3 + s.s_eternal_pos
      END AS fixed_pos,
      row_number() OVER (
        PARTITION BY (s.s_top3_pos IS NULL AND s.s_eternal_pos IS NULL)
        ORDER BY s.s_score DESC, s.b_created_at ASC
      ) AS organic_rank
    FROM scored s
  ),
  free_positions AS (
    SELECT g AS pos, row_number() OVER (ORDER BY g) AS slot_rank
    FROM generate_series(1, 1000) g
    WHERE g NOT IN (SELECT pl.fixed_pos FROM placed pl WHERE pl.fixed_pos IS NOT NULL)
  )
  SELECT
    coalesce(pl.fixed_pos, fp.pos)::integer AS rank_position,
    pl.b_id AS beat_id,
    pl.b_user_id AS creator_id,
    pl.b_title AS title,
    pl.b_genre AS genre,
    pl.b_bpm AS bpm,
    pl.b_cover_url AS cover_url,
    pl.b_data AS data,
    pl.b_play_count AS play_count,
    pl.s_likes AS likes_count,
    pl.s_boost_points AS boost_points,
    pl.s_score AS score,
    pl.s_top3_until AS top3_until,
    pl.s_boost_until AS boost_until,
    pl.s_is_eternal AS is_eternal
  FROM placed pl
  LEFT JOIN free_positions fp
    ON pl.fixed_pos IS NULL AND fp.slot_rank = pl.organic_rank
  WHERE pl.fixed_pos IS NOT NULL OR fp.pos IS NOT NULL
  ORDER BY rank_position
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION get_trending_beats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_trending_beats(integer) TO authenticated;
