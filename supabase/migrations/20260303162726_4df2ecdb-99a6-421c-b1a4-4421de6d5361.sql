
-- Quarterly tax payments tracking
CREATE TABLE public.quarterly_tax_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tax_year integer NOT NULL DEFAULT 2026,
  quarter integer NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  date_paid text NOT NULL,
  payment_type text NOT NULL DEFAULT 'federal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quarterly_tax_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own quarterly payments" ON public.quarterly_tax_payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Invoice payments (partial payment tracking)
CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  date_paid text NOT NULL,
  method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own invoice payments" ON public.invoice_payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add receipt_url to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_url text;

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false) ON CONFLICT DO NOTHING;

-- RLS for receipts bucket
CREATE POLICY "Users can upload receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own receipts" ON storage.objects FOR DELETE USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
