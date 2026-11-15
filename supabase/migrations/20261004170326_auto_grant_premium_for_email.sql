-- Auto-grant premium to specific email on registration
CREATE OR REPLACE FUNCTION public.auto_grant_premium()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'smirnovakaleriya2006@gmail.com' THEN
    UPDATE profiles
    SET is_premium = true,
        premium_expires_at = NOW() + INTERVAL '365 days'
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_premium ON auth.users;
CREATE TRIGGER on_auth_user_created_premium
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_premium();

-- Also check if already registered and grant premium
UPDATE profiles p
SET is_premium = true,
    premium_expires_at = NOW() + INTERVAL '365 days'
FROM auth.users u
WHERE p.id = u.id
  AND u.email = 'smirnovakaleriya2006@gmail.com';
