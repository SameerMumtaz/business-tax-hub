
CREATE TABLE public.reconciliation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_name text NOT NULL,
  period_start text NOT NULL,
  period_end text NOT NULL,
  statement_balance numeric NOT NULL DEFAULT 0,
  reconciled_at timestamp with time zone,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own reconciliation periods"
  ON public.reconciliation_periods
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
