/*
# PvP arena: real Elo rating settled on the server

1. What changes
- New function `finish_arena_match(p_match_id)` decides the winner of an arena battle from the recorded spectator votes and updates BOTH players' ratings with an Elo calculation (K = 32).
- Ratings only move when a match is actually finished. Draws (equal votes) leave both ratings unchanged.

2. Security
- The function runs as SECURITY DEFINER so it can update the opponent's rating row, which row level security does not allow a client to do.
- Only signed-in users can call it. A participant can finish a match at any time; anyone else can finish it only after the match deadline has passed.
- A match cannot be finished twice and a match without two different players cannot be finished.
- EXECUTE is revoked from PUBLIC and anon, and granted to authenticated only.

3. Notes
- Vote totals are counted from the spectator votes table instead of the match's running counters, so the result cannot be skewed by counter updates.
*/

CREATE OR REPLACE FUNCTION public.finish_arena_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  m pvp_arena_matches%ROWTYPE;
  v_season uuid;
  ra pvp_player_ratings%ROWTYPE;
  rb pvp_player_ratings%ROWTYPE;
  v_votes_a integer;
  v_votes_b integer;
  v_winner uuid;
  v_exp_a numeric;
  v_delta_a integer := 0;
  v_delta_b integer := 0;
  v_streak_a integer;
  v_streak_b integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO m FROM pvp_arena_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found';
  END IF;
  IF m.status <> 'active' THEN
    RAISE EXCEPTION 'match already finished';
  END IF;
  IF m.player_a_id = m.player_b_id THEN
    RAISE EXCEPTION 'match has no opponent yet';
  END IF;
  IF v_uid NOT IN (m.player_a_id, m.player_b_id) AND m.ends_at > now() THEN
    RAISE EXCEPTION 'only participants can finish a match before its deadline';
  END IF;

  v_season := COALESCE(m.season_id, (SELECT id FROM pvp_seasons WHERE is_current LIMIT 1));
  IF v_season IS NULL THEN
    RAISE EXCEPTION 'no active season';
  END IF;

  SELECT count(*) FILTER (WHERE vote_for = 'a'), count(*) FILTER (WHERE vote_for = 'b')
    INTO v_votes_a, v_votes_b
    FROM spectator_votes WHERE match_id = m.id;

  INSERT INTO pvp_player_ratings (user_id, season_id)
  SELECT x, v_season FROM unnest(ARRAY[m.player_a_id, m.player_b_id]) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM pvp_player_ratings r WHERE r.user_id = x AND r.season_id = v_season
  );

  SELECT * INTO ra FROM pvp_player_ratings WHERE user_id = m.player_a_id AND season_id = v_season;
  SELECT * INTO rb FROM pvp_player_ratings WHERE user_id = m.player_b_id AND season_id = v_season;

  IF v_votes_a > v_votes_b THEN
    v_winner := m.player_a_id;
  ELSIF v_votes_b > v_votes_a THEN
    v_winner := m.player_b_id;
  ELSE
    v_winner := NULL;
  END IF;

  IF v_winner IS NOT NULL THEN
    v_exp_a := 1 / (1 + power(10, (rb.rating - ra.rating) / 400.0));
    IF v_winner = m.player_a_id THEN
      v_delta_a := round(32 * (1 - v_exp_a));
      v_delta_b := -v_delta_a;
    ELSE
      v_delta_b := round(32 * (1 - (1 - v_exp_a)));
      v_delta_a := -v_delta_b;
    END IF;
  END IF;

  v_streak_a := CASE WHEN v_winner = m.player_a_id THEN ra.streak + 1 WHEN v_winner IS NULL THEN ra.streak ELSE 0 END;
  v_streak_b := CASE WHEN v_winner = m.player_b_id THEN rb.streak + 1 WHEN v_winner IS NULL THEN rb.streak ELSE 0 END;

  UPDATE pvp_player_ratings SET
    rating = ra.rating + v_delta_a,
    wins = ra.wins + CASE WHEN v_winner = m.player_a_id THEN 1 ELSE 0 END,
    losses = ra.losses + CASE WHEN v_winner IS NOT NULL AND v_winner <> m.player_a_id THEN 1 ELSE 0 END,
    streak = v_streak_a,
    best_streak = GREATEST(ra.best_streak, v_streak_a)
  WHERE id = ra.id;

  UPDATE pvp_player_ratings SET
    rating = rb.rating + v_delta_b,
    wins = rb.wins + CASE WHEN v_winner = m.player_b_id THEN 1 ELSE 0 END,
    losses = rb.losses + CASE WHEN v_winner IS NOT NULL AND v_winner <> m.player_b_id THEN 1 ELSE 0 END,
    streak = v_streak_b,
    best_streak = GREATEST(rb.best_streak, v_streak_b)
  WHERE id = rb.id;

  UPDATE pvp_arena_matches SET
    status = 'completed',
    winner_id = v_winner,
    rating_delta_a = v_delta_a,
    rating_delta_b = v_delta_b,
    season_id = v_season
  WHERE id = m.id;

  RETURN jsonb_build_object('winner_id', v_winner, 'delta_a', v_delta_a, 'delta_b', v_delta_b, 'votes_a', v_votes_a, 'votes_b', v_votes_b);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_arena_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_arena_match(uuid) TO authenticated;
