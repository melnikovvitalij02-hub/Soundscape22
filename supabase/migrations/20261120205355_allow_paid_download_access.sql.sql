/*
# Allow paid downloads on beats

1. Plain-English explanation
   The "beats" table stores a per-beat download access rule in the
   `download_access` column. Until now the database only accepted two
   values: 'premium' (only Premium subscribers may download) and 'nobody'
   (no one may download). The publishing screen also offers a third
   option — "paid download", where any user can buy the download for
   Gems. Publishing a beat with that option currently fails with a
   database error because of the strict CHECK constraint.

2. Modified Tables
   - `beats`: the CHECK constraint `beats_download_access_check` is
     replaced so the allowed values become 'premium', 'paid', 'nobody'.
     No data is changed or lost; existing rows already satisfy the new
     rule. The `comment_access` constraint is left untouched.

3. Security
   - No RLS, policy, or grant changes. Row Level Security behavior is
     identical before and after this migration.

4. Important notes
   - Idempotent: dropping the old constraint by name and re-creating the
     new one is safe to re-run.
   - Application code (the beats feed) is updated separately to treat
     'paid' as " purchasable download " alongside 'premium'.
*/

ALTER TABLE public.beats
  DROP CONSTRAINT IF EXISTS beats_download_access_check;

ALTER TABLE public.beats
  ADD CONSTRAINT beats_download_access_check
  CHECK (download_access IN ('premium', 'paid', 'nobody'));
