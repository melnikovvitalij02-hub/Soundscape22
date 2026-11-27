/*
# Gartic Sounds phase 1b: guess-mode handoff in submit

`gartic_submit_step`: in 'guess' mode, after the author (holder of step 0)
submits the original beat, the chain moves to step 1 with no holder and the
room switches to status 'guessing' with a fresh deadline. Other players then
submit recreations via `gartic_guess_submit`. Grants unchanged.
*/

CREATE OR REPLACE FUNCTION gartic_submit_step(p_chain_id uuid, p_type text, p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chain game_chains%ROWTYPE;
  v_room game_rooms%ROWTYPE;
  v_players uuid[];
  v_n int;
  v_idx int := 0;
  v_i int;
  v_last_type text;
  v_expected text;
  v_is_complete boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_type NOT IN ('beat', 'description') THEN RAISE EXCEPTION 'Invalid step type'; END IF;
  IF p_content IS NULL OR length(p_content) = 0 OR length(p_content) > 500000 THEN
    RAISE EXCEPTION 'Invalid content';
  END IF;

  SELECT * INTO v_chain FROM game_chains WHERE id = p_chain_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chain not found'; END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = v_chain.room_id FOR UPDATE;
  IF v_room.status <> 'playing' THEN RAISE EXCEPTION 'Game is not running'; END IF;
  IF v_chain.completed THEN RAISE EXCEPTION 'Chain is already complete'; END IF;
  IF v_chain.current_holder_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_room.step_deadline IS NOT NULL AND v_room.step_deadline < now() - interval '30 seconds' THEN
    RAISE EXCEPTION 'Round time is over';
  END IF;
  IF p_type = 'description' AND length(p_content) > 300 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;

  IF v_room.mode = 'continue' THEN
    v_expected := 'beat';
  ELSIF v_room.mode = 'guess' THEN
    v_expected := CASE WHEN v_chain.current_step = 0 THEN 'beat' ELSE 'description' END;
  ELSE
    SELECT type INTO v_last_type FROM game_chain_steps
    WHERE chain_id = p_chain_id ORDER BY step_index DESC LIMIT 1;
    v_expected := CASE WHEN v_last_type = 'beat' THEN 'description' ELSE 'beat' END;
  END IF;
  IF p_type <> v_expected THEN RAISE EXCEPTION 'Wrong step type for this round'; END IF;

  INSERT INTO game_chain_steps (chain_id, step_index, type, content, author_id, author_name)
  VALUES (
    p_chain_id, v_chain.current_step, p_type, p_content, v_uid,
    COALESCE((SELECT username FROM game_room_players WHERE room_id = v_chain.room_id AND user_id = v_uid), '')
  );

  IF v_room.mode = 'guess' THEN
    UPDATE game_chains SET current_step = 1, current_holder_id = NULL WHERE id = p_chain_id;
    UPDATE game_rooms
    SET status = 'guessing',
        step_deadline = now() + make_interval(secs => GREATEST(v_room.round_time_seconds, 30))
    WHERE id = v_room.id;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(user_id ORDER BY joined_at), '{}') INTO v_players
  FROM game_room_players WHERE room_id = v_room.id;
  v_n := array_length(v_players, 1);
  IF v_n IS NULL OR v_n < 2 THEN
    UPDATE game_chains SET completed = true, current_holder_id = NULL WHERE id = p_chain_id;
    RETURN;
  END IF;

  FOR v_i IN 1..v_n LOOP
    IF v_players[v_i] = v_uid THEN v_idx := v_i; END IF;
  END LOOP;

  v_is_complete := v_chain.current_step + 1 >= v_room.total_rounds;
  IF v_is_complete THEN
    UPDATE game_chains
    SET current_step = current_step + 1, completed = true, current_holder_id = NULL
    WHERE id = p_chain_id;
  ELSE
    UPDATE game_chains
    SET current_step = current_step + 1,
        current_holder_id = v_players[(v_idx % v_n) + 1]
    WHERE id = p_chain_id;
  END IF;

  UPDATE game_rooms
  SET step_deadline = now() + make_interval(secs => GREATEST(v_room.round_time_seconds, 30))
  WHERE id = v_room.id;
END;
$$;
