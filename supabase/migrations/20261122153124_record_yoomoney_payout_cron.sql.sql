/*
# Record scheduled YooMoney payouts job (documentation migration)

1. Plain-English explanation
   The cron job for automatic payouts was created interactively after the
   pg_cron/pg_net extensions were enabled (job name
   'yoomoney-payout-10min', schedule every 10 minutes, HTTP POST to the
   yoomoney-payout edge function). This migration documents the same
   definition idempotently for fresh database rebuilds: it unschedules the
   job if present and re-creates it with identical parameters.

   Note: cron.schedule returns an error when unscheduling a job that does
   not exist, so the unschedule call is wrapped in a DO block that
   swallows the "could not find valid entry" error on fresh databases.

2. Security
   - The job only POSTs to this project's own edge function using the
     public anon key. No RLS/grant changes.

3. Important notes
   - If YOOMONEY_PAYOUT_TOKEN is not configured, the function is a no-op
     and the job keeps retrying harmlessly.
*/

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('yoomoney-payout-10min');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job does not exist yet on a fresh database
  END;
END $$;

SELECT cron.schedule(
  'yoomoney-payout-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url    := 'https://cccoflivuzxzujieuhvo.supabase.co/functions/v1/yoomoney-payout',
    headers:= json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjY29mbGl2dXp4enVqaWV1aHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4ODk3MDcsImV4cCI6MjEwNDQ2NTcwN30.-suTh6a9r7yQOPacLl7Ez8mrFIw7kKrepkqNT964bNI'
    )::jsonb
  );
  $$
);
