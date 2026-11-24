/*
# Disable Gem withdrawal completely

1. Plain-English explanation
- The Gem withdrawal feature is removed from the product. The shop no longer
  renders a withdrawal block, accepts card details, creates payout claims, or
  redirects to a payout flow.
- Existing withdrawal history is preserved for audit and data safety. No user
  balances or historical records are deleted.

2. Modified functions
- `claim_gem_withdrawal(int, text)`: remains in the database only so existing
  migration history and old records remain structurally compatible, but it can
  no longer be called by any application role.
- `refund_gem_withdrawal(uuid, text)`: likewise remains inaccessible; the old
  payout function that used it is being removed.

3. Security changes
- EXECUTE is revoked from PUBLIC, anon, authenticated, and service_role for
  both withdrawal functions.
- The deployed `yoomoney-payout` function is removed separately from the
  serverless functions list.
- No columns, user balances, or historical withdrawal records are deleted.
*/

REVOKE EXECUTE ON FUNCTION claim_gem_withdrawal(int, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION refund_gem_withdrawal(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
