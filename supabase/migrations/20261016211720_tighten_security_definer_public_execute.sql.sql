/*
# Remove public execution from privileged account functions

1. Purpose
- Remote-callable SECURITY DEFINER functions are server-side APIs and must not be callable by anonymous visitors.
- The existing database posture showed several privileged functions inheriting EXECUTE from PUBLIC even though the application uses them only for signed-in users.

2. Security changes
- Revoke EXECUTE from PUBLIC and anon for currency, withdrawal, cosmetic, and Premium functions.
- Grant EXECUTE only to authenticated users.
- The functions themselves remain responsible for checking auth.uid() and ownership; this migration only closes the anonymous entry point.

3. Data safety
- No tables, rows, columns, policies, or user data are deleted or changed.
- Existing signed-in shop, currency, withdrawal, cosmetic, and Premium flows keep their authenticated access.
*/

REVOKE EXECUTE ON FUNCTION change_donate_coins(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION change_donate_coins(integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION request_withdrawal(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_withdrawal(integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION equip_cosmetic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION equip_cosmetic(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION grant_premium_for_payment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grant_premium_for_payment() TO authenticated;

REVOKE EXECUTE ON FUNCTION cancel_premium() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_premium() TO authenticated;
