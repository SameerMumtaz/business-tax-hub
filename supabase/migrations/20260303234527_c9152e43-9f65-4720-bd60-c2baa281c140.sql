
-- Add tax_collected to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_collected numeric NOT NULL DEFAULT 0;

-- Add default_tax_rate to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_tax_rate numeric NOT NULL DEFAULT 0;

-- Create sales_tax_filings table
CREATE TABLE public.sales_tax_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_label text NOT NULL,
  period_start text NOT NULL,
  period_end text NOT NULL,
  tax_collected numeric NOT NULL DEFAULT 0,
  filed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_tax_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own sales tax filings"
  ON public.sales_tax_filings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
