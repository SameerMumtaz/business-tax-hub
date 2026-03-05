ALTER TABLE public.jobs
  ADD COLUMN price numeric NOT NULL DEFAULT 0,
  ADD COLUMN material_budget numeric NOT NULL DEFAULT 0,
  ADD COLUMN labor_budget_type text NOT NULL DEFAULT 'amount',
  ADD COLUMN labor_budget_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN labor_budget_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN labor_budget_rate numeric NOT NULL DEFAULT 0;