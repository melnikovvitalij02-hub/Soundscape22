/*
# User reports

1. New table
- user_reports: who reported whom, the reason from a fixed list, optional details.
- One report per reporter and target, so the same user cannot flood the moderation queue.

2. Security
- RLS enabled. Signed-in users can only insert reports as themselves and cannot read reports.
- Moderators read reports through the database dashboard.
*/

CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'hate', 'sexual', 'threats', 'fraud', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_not_self CHECK (reporter_id <> reported_id),
  CONSTRAINT user_reports_one_per_pair UNIQUE (reporter_id, reported_id)
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.user_reports TO authenticated;

CREATE POLICY "reports_insert_own" ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);
