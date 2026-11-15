/*
# Fix coin_purchases table — add missing columns

The coin_purchases table was originally created by an earlier migration
with columns (id, user_id, package_id, coins_amount, rub_amount, status, created_at).
A later migration tried to re-create the table with additional columns
(label, yoomoney_operation_id, completed_at) using CREATE TABLE IF NOT EXISTS,
which was a no-op because the table already existed.

The frontend CoinPurchase component inserts `label` into coin_purchases,
but the column doesn't exist, so every insert fails silently and the
"Купить" button appears broken.

1. Added Columns
- `label` (text): the YooMoney payment label (e.g. coins_100_<userId>)
- `yoomoney_operation_id` (text): YooMoney operation ID, set by webhook
- `completed_at` (timestamptz): when the purchase was confirmed

2. Notes
- All additions use ADD COLUMN IF NOT EXISTS, safe to re-run.
- No data is lost; existing rows get NULL for the new columns.
*/

ALTER TABLE coin_purchases ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE coin_purchases ADD COLUMN IF NOT EXISTS yoomoney_operation_id text;
ALTER TABLE coin_purchases ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- The webhook updates coin_purchases by label + status='pending'
CREATE INDEX IF NOT EXISTS idx_coin_purchases_label ON coin_purchases(label);
CREATE INDEX IF NOT EXISTS idx_coin_purchases_status ON coin_purchases(status);
