CREATE TABLE public.audit_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_id text NOT NULL,
  issue_type text NOT NULL,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, transaction_id, issue_type)
);

ALTER TABLE public.audit_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own audit dismissals"
  ON public.audit_dismissals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);