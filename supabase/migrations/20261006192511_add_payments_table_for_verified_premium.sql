/*
# Create payments table for verified YooMoney payments

1. New Tables
- `payments`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles, the user who paid)
  - `yoomoney_operation_id` (text, unique — YooMoney's operation_id)
  - `amount` (numeric, payment amount in rubles)
  - `status` (text, default 'succeeded' — payment status)
  - `label` (text, the subscription_<userId> label)
  - `created_at` (timestamptz)

2. Security
- RLS enabled. Authenticated users can read their own payments.
- INSERT is allowed for the service role (webhook uses service role key).
- The webhook writes a row here BEFORE granting premium.
- PaymentSuccessPage checks this table for a matching payment_id.
*/

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  yoomoney_operation_id text UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'succeeded',
  label text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payments" ON payments;
CREATE POLICY "select_own_payments"
ON payments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_payments_service" ON payments;
CREATE POLICY "insert_payments_service"
ON payments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
