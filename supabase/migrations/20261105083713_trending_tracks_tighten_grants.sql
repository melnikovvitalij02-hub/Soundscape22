/*
# Trending tracks: tighten grants

1. Modified Objects
- `trending_promotions`: all table privileges removed from `anon` and `authenticated`, then read access re-granted on public columns only (no buyer id, no writes).
- `get_trending_beats`: execute granted to `anon` as well, so the ranking is visible to guest visitors like the rest of the beat feed.

2. Security
- Writes to promotions remain possible only through `buy_trending_promotion`.
- The ranking function is read-only and runs with the caller's permissions.

3. Notes
- Safe to re-run.
*/

REVOKE ALL ON trending_promotions FROM anon, authenticated;
GRANT SELECT (id, beat_id, kind, price_coins, boost_points, created_at, expires_at) ON trending_promotions TO anon, authenticated;

GRANT EXECUTE ON FUNCTION get_trending_beats(integer) TO anon;
