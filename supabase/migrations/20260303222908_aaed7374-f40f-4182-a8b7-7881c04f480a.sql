
-- Vehicles registry
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  year INTEGER,
  make TEXT,
  model TEXT,
  vin_last6 TEXT,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  loan_amount NUMERIC NOT NULL DEFAULT 0,
  interest_rate NUMERIC NOT NULL DEFAULT 0,
  loan_term_months INTEGER NOT NULL DEFAULT 60,
  monthly_payment NUMERIC NOT NULL DEFAULT 0,
  loan_start_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own vehicles"
  ON public.vehicles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Vehicle payments (actual payments made)
CREATE TABLE public.vehicle_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  payment_number INTEGER NOT NULL DEFAULT 1,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  principal_portion NUMERIC NOT NULL DEFAULT 0,
  interest_portion NUMERIC NOT NULL DEFAULT 0,
  date_paid TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own vehicle payments"
  ON public.vehicle_payments FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Junction table linking expenses to vehicles
CREATE TABLE public.vehicle_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, expense_id)
);

ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own vehicle expenses"
  ON public.vehicle_expenses FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_expenses.vehicle_id AND v.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_expenses.vehicle_id AND v.user_id = auth.uid()
  ));
