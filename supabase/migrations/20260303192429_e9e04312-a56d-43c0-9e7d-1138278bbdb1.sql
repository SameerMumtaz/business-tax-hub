CREATE TABLE public.pay_rate_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  previous_rate numeric NOT NULL DEFAULT 0,
  new_rate numeric NOT NULL DEFAULT 0,
  effective_date text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);
ALTER TABLE public.pay_rate_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own pay rate changes" ON public.pay_rate_changes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);