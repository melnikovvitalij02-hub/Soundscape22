/*
# Gartic Sounds phase 1c: guaranteed progress on expired rounds

`gartic_skip_expired` (same signature as before):
- while status = 'playing': every incomplete chain is advanced one step
  (the holder who ran out of time loses the turn) or completed at the last
  step, and the room deadline is reset;
- while status = 'guessing': the listening window ends and the room is marked
  'finished' (the host can still pick a winner afterwards).
Grants unchanged.
*/

CREATE OR REPLACE FUNCTION gartic_skip_expired(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room game_rooms%ROWTYPE;
  v_chain game_chains%ROWTYPE;
  v_players uuid[];
  v_n int;
  v_idx int;
  v_i int;
  v_next uuid;
  v_done boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM game_room_players WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_room.step_deadline IS NULL OR v_room.step_deadline > now() THEN
    RAISE EXCEPTION 'Round is still running';
  END IF;

  IF v_room.status = 'guessing' THEN
    UPDATE game_rooms SET status = 'finished' WHERE id = p_room_id;
    RETURN;
  END IF;
  IF v_room.status <> 'playing' THEN RETURN; END IF;

  SELECT COALESCE(array_agg(user_id ORDER BY joined_at), '{}') INTO v_players
  FROM game_room_players WHERE room_id = p_room_id;
  v_n := array_length(v_players, 1);

  FOR v_chain IN
    SELECT * FROM game_chains WHERE room_id = p_room_id AND completed = false FOR UPDATE
  LOOP
    v_done := v_chain.current_step + 1 >= v_room.total_rounds;
    IF v_n < 2 OR v_chain.current_holder_id IS NULL THEN
      UPDATE game_chains SET completed = true, current_holder_id = NULL WHERE id = v_chain.id;
    ELSE
      v_idx := 1;
      FOR v_i IN 1..v_n LOOP
        IF v_players[v_i] = v_chain.current_holder_id THEN v_idx := v_i; END IF;
      END LOOP;
      v_next := v_players[(v_idx % v_n) + 1];
      UPDATE game_chains
      SET current_step = current_step + 1,
          completed = v_done,
          current_holder_id = CASE WHEN v_done THEN NULL ELSE v_next END
      WHERE id = v_chain.id;
    END IF;
  END LOOP;

  UPDATE game_rooms
  SET step_deadline = now() + make_interval(secs => GREATEST(v_room.round_time_seconds, 30))
  WHERE id = p_room_id;
END;
$$;
