/*
# Beat MP3 uploads and audio links for trending

1. New storage
- Public bucket `beat-audio` for MP3/WAV beat files (max 30 MB each).
- Each user writes only into their own folder `<user_id>/...`.

2. Modified function
- `get_trending_beats` now also returns `audio_url`, so the trending page can play uploaded MP3 beats.
  The function is recreated because its return columns changed; its EXECUTE grants are restored.

3. Security
- storage.objects: INSERT and DELETE restricted to the owner's folder for `authenticated`.
- Public read works through the public bucket URL; no extra SELECT policy is needed.
- Function EXECUTE: revoked from PUBLIC and anon, granted to anon and authenticated (same as before).

4. Notes
- Idempotent: bucket insert uses ON CONFLICT, policies are dropped before creation.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('beat-audio', 'beat-audio', true, 31457280, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "beat_audio_insert_own_folder" ON storage.objects;
CREATE POLICY "beat_audio_insert_own_folder" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'beat-audio' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "beat_audio_delete_own_folder" ON storage.objects;
CREATE POLICY "beat_audio_delete_own_folder" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'beat-audio' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP FUNCTION IF EXISTS public.get_trending_beats(integer);

CREATE FUNCTION public.get_trending_beats(p_limit integer DEFAULT 50)
RETURNS TABLE(
  rank_position integer, beat_id uuid, creator_id uuid, title text, genre text, bpm integer,
  cover_url text, audio_url text, data jsonb, play_count integer, likes_count bigint,
  boost_points bigint, score bigint, top3_until timestamptz, boost_until timestamptz, is_eternal boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
    b.audio_url AS b_audio_url,
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
  pl.b_audio_url AS audio_url,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_trending_beats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_beats(integer) TO anon, authenticated;
