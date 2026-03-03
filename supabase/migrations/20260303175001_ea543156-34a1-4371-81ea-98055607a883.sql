
-- W-2 income entries
CREATE TABLE public.w2_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employer_name text NOT NULL,
  employer_ein text,
  wages numeric NOT NULL DEFAULT 0,
  federal_tax_withheld numeric NOT NULL DEFAULT 0,
  state_tax_withheld numeric NOT NULL DEFAULT 0,
  social_security_withheld numeric NOT NULL DEFAULT 0,
  medicare_withheld numeric NOT NULL DEFAULT 0,
  state text,
  tax_year integer NOT NULL DEFAULT 2026,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.w2_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own w2 income"
  ON public.w2_income
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Personal expenses
CREATE TABLE public.personal_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date text NOT NULL,
  description text,
  vendor text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Other',
  tax_deductible boolean NOT NULL DEFAULT false,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own personal expenses"
  ON public.personal_expenses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Personal deductions (itemized entries)
CREATE TABLE public.personal_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  tax_year integer NOT NULL DEFAULT 2026,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own personal deductions"
  ON public.personal_deductions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
