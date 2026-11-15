/*
# Trending tracks: record plays from any visitor

1. New Functions
- `increment_beat_play(p_beat_id)`: adds one play to a public beat.

2. Why
- Plays drive the trending ranking. Regular updates to beats are limited to the owner by row security, so other listeners could never move a track up the ranking.

3. Security
- SECURITY DEFINER with a fixed search path, touching only the play counter of public beats.
- Callable by visitors (anon) and signed-in users; no other beat fields can be changed through it.

4. Notes
- Safe to re-run.
*/

CREATE OR REPLACE FUNCTION increment_beat_play(p_beat_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beats SET play_count = play_count + 1 WHERE id = p_beat_id AND is_public;
$$;

REVOKE EXECUTE ON FUNCTION increment_beat_play(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_beat_play(uuid) TO anon, authenticated;
