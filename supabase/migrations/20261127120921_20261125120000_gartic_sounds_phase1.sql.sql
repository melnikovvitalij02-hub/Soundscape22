/*
# Gartic Sounds phase 1: reliable rounds, room settings, new game modes

1. Modified tables
- `game_chain_steps`: the `type` CHECK now also allows 'beat' and 'description'
  (the music step types the Gartic Sounds page already writes) alongside
  the original 'prompt'/'drawing'.
- `game_rooms`: new columns
  - `mode` text — 'classic' | 'continue' | 'guess' (default 'classic')
  - `round_time_seconds` int — per-round time limit (default 180, max 600)
  - `bpm` int — room tempo (default 120)
  - `bars` int — bars per submitted beat in classic/continue (default 1)
  - `max_bars` int — bars limit for the guess-mode creator (default 1, up to 256)
  - `instruments` text[] — allowed track types (default all four)
  - `step_deadline` timestamptz — when the current round expires
  - `guess_winner_step_id` uuid — creator's pick in guess mode
  - status CHECK widened to also allow 'guessing'

2. New functions (all SECURITY DEFINER, actor derived from auth.uid())
- `gartic_submit_step(p_chain_id, p_type, p_content)` — atomic step submit:
  validates the room is playing, the chain is not complete, the caller is the
  current holder and the step type matches the mode's expectation, inserts the
  step and advances/completes the chain in one transaction; the next holder is
  computed from `game_room_players` in the database (never from client state),
  so departed players can't break rotation. Also refreshes the room deadline.
- `gartic_skip_expired(p_room_id)` — any room player may call it once the
  deadline has passed: chains whose holder left the room are advanced (or
  completed), and the deadline is reset. This is what removes the hangs when a
  player abandons a game mid-round.
- `gartic_guess_submit(p_room_id, p_content)` — in guess mode, players other
  than the author submit their recreation of the original beat.
- `gartic_pick_guess(p_room_id, p_step_id)` — the author picks the winning
  recreation, which finishes the round.

3. Security
- RLS unchanged on all tables.
- EXECUTE on all four functions revoked from PUBLIC/anon and granted to
  authenticated only. Each function re-checks membership/authorization inside.
- `game_rooms.guess_winner_step_id` is only written through
  `gartic_pick_guess` (the host-only UPDATE policy stays in force for the rest).
*/

ALTER TABLE game_chain_steps DROP CONSTRAINT IF EXISTS game_chain_steps_type_check;
ALTER TABLE game_chain_steps ADD CONSTRAINT game_chain_steps_type_check
  CHECK (type IN ('prompt', 'drawing', 'beat', 'description'));

ALTER TABLE game_rooms DROP CONSTRAINT IF EXISTS game_rooms_status_check;
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_status_check
  CHECK (status IN ('waiting', 'playing', 'guessing', 'finished'));

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS round_time_seconds int NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS bpm int NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS bars int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_bars int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS instruments text[] NOT NULL DEFAULT '{kick,snare,hihat,bass}',
  ADD COLUMN IF NOT EXISTS step_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS guess_winner_step_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_rooms_mode_check') THEN
    ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_mode_check
      CHECK (mode IN ('classic', 'continue', 'guess'));
  END IF;
END $$;

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
  v_idx int := 0;
  v_i int;
  v_next uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status <> 'playing' THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM game_room_players WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_room.step_deadline IS NULL OR v_room.step_deadline > now() THEN
    RAISE EXCEPTION 'Round is still running';
  END IF;

  SELECT COALESCE(array_agg(user_id ORDER BY joined_at), '{}') INTO v_players
  FROM game_room_players WHERE room_id = p_room_id;
  v_n := array_length(v_players, 1);

  FOR v_chain IN
    SELECT * FROM game_chains WHERE room_id = p_room_id AND completed = false FOR UPDATE
  LOOP
    IF v_chain.current_holder_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM game_room_players WHERE room_id = p_room_id AND user_id = v_chain.current_holder_id
    ) THEN
      IF v_n < 2 THEN
        UPDATE game_chains SET completed = true, current_holder_id = NULL WHERE id = v_chain.id;
      ELSE
        v_idx := 1;
        FOR v_i IN 1..v_n LOOP
          IF v_players[v_i] = v_chain.current_holder_id THEN v_idx := v_i; END IF;
        END LOOP;
        v_next := v_players[(v_idx % v_n) + 1];
        UPDATE game_chains
        SET current_step = current_step + 1,
            current_holder_id = v_next,
            completed = (v_chain.current_step + 1 >= v_room.total_rounds)
        WHERE id = v_chain.id;
      END IF;
    END IF;
  END LOOP;

  UPDATE game_rooms
  SET step_deadline = now() + make_interval(secs => GREATEST(v_room.round_time_seconds, 30))
  WHERE id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION gartic_guess_submit(p_room_id uuid, p_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room game_rooms%ROWTYPE;
  v_chain game_chains%ROWTYPE;
  v_max_step int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_content IS NULL OR length(p_content) = 0 OR length(p_content) > 500000 THEN
    RAISE EXCEPTION 'Invalid content';
  END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status <> 'guessing' THEN RAISE EXCEPTION 'Guessing is not open'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM game_room_players WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_chain FROM game_chains WHERE room_id = p_room_id ORDER BY chain_index LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chain not found'; END IF;
  IF v_chain.current_holder_id = v_uid THEN RAISE EXCEPTION 'The author does not guess'; END IF;
  IF EXISTS (SELECT 1 FROM game_chain_steps WHERE chain_id = v_chain.id AND author_id = v_uid AND step_index > 1) THEN
    RAISE EXCEPTION 'You already submitted';
  END IF;

  SELECT COALESCE(max(step_index), 1) INTO v_max_step FROM game_chain_steps WHERE chain_id = v_chain.id;

  INSERT INTO game_chain_steps (chain_id, step_index, type, content, author_id, author_name)
  VALUES (
    v_chain.id, v_max_step + 1, 'beat', p_content, v_uid,
    COALESCE((SELECT username FROM game_room_players WHERE room_id = p_room_id AND user_id = v_uid), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION gartic_pick_guess(p_room_id uuid, p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room game_rooms%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.host_id <> v_uid THEN RAISE EXCEPTION 'Only the author can pick'; END IF;
  IF v_room.status <> 'guessing' THEN RAISE EXCEPTION 'Guessing is not open'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM game_chain_steps s
    JOIN game_chains c ON c.id = s.chain_id
    WHERE s.id = p_step_id AND c.room_id = p_room_id AND s.author_id <> v_room.host_id
  ) THEN RAISE EXCEPTION 'Invalid pick'; END IF;

  UPDATE game_rooms SET guess_winner_step_id = p_step_id, status = 'finished' WHERE id = p_room_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION gartic_submit_step(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION gartic_skip_expired(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION gartic_guess_submit(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION gartic_pick_guess(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION gartic_submit_step(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION gartic_skip_expired(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION gartic_guess_submit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION gartic_pick_guess(uuid, uuid) TO authenticated;
