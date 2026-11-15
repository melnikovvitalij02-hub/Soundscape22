/*
# Tighten database function access

1. Make the shared timestamp trigger use a fixed public search path.
2. Remove anonymous execute access from the registration-only premium trigger function.
3. Keep rate_limits deny-by-default because only the server-side rate-limit function uses it.
*/

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_grant_premium() FROM PUBLIC, anon, authenticated;
