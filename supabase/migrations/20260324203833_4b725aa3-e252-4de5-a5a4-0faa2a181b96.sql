
CREATE TABLE public.job_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_hours NUMERIC,
  price NUMERIC NOT NULL DEFAULT 0,
  material_budget NUMERIC NOT NULL DEFAULT 0,
  labor_budget_type TEXT NOT NULL DEFAULT 'amount',
  labor_budget_amount NUMERIC NOT NULL DEFAULT 0,
  labor_budget_hours NUMERIC NOT NULL DEFAULT 0,
  labor_budget_rate NUMERIC NOT NULL DEFAULT 0,
  default_crew JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own job templates"
  ON public.job_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
