/*
# Fix message insert failures for signed-in users

1. Trigger functions run with the owner's rights
- mask_message_content and reject_profane_username call profanity helpers.
  They ran as the signed-in user, who has no EXECUTE on those helpers, so
  inserts into chat_messages, private_messages and profiles failed.
  They are now SECURITY DEFINER with an empty search_path (all calls are schema-qualified).

2. Lock down direct calls
- Triggers do not need EXECUTE for callers, so EXECUTE is revoked from PUBLIC, anon and authenticated.

3. Security
- No table, policy or grant changes.
*/

ALTER FUNCTION public.mask_message_content() SECURITY DEFINER SET search_path = '';
ALTER FUNCTION public.reject_profane_username() SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.mask_message_content() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_profane_username() FROM PUBLIC, anon, authenticated;
