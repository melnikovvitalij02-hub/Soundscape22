/*
# Enable pg_cron and pg_net extensions

1. Plain-English explanation
   Enables the database task scheduler (pg_cron) and async HTTP client
   (pg_net) in their recommended schemas. These are prerequisites for the
   scheduled automatic YooMoney payout job.

2. Security
   - Extension installation only; no table, RLS, or grant changes.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
