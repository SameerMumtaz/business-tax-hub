
-- Categorization rules: vendor keyword → category mapping
CREATE TABLE public.categorization_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public read for now since no auth yet)
ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (no auth in this app yet)
CREATE POLICY "Allow public read" ON public.categorization_rules FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.categorization_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.categorization_rules FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.categorization_rules FOR DELETE USING (true);

-- Seed with the default keyword mappings
INSERT INTO public.categorization_rules (vendor_pattern, category, type, priority) VALUES
  ('amazon', 'Office Supplies', 'expense', 0),
  ('staples', 'Office Supplies', 'expense', 0),
  ('office depot', 'Office Supplies', 'expense', 0),
  ('airline', 'Travel', 'expense', 0),
  ('delta', 'Travel', 'expense', 0),
  ('united', 'Travel', 'expense', 0),
  ('southwest', 'Travel', 'expense', 0),
  ('uber', 'Travel', 'expense', 0),
  ('lyft', 'Travel', 'expense', 0),
  ('hotel', 'Travel', 'expense', 0),
  ('airbnb', 'Travel', 'expense', 0),
  ('aws', 'Software & SaaS', 'expense', 0),
  ('google cloud', 'Software & SaaS', 'expense', 0),
  ('figma', 'Software & SaaS', 'expense', 0),
  ('slack', 'Software & SaaS', 'expense', 0),
  ('zoom', 'Software & SaaS', 'expense', 0),
  ('adobe', 'Software & SaaS', 'expense', 0),
  ('github', 'Software & SaaS', 'expense', 0),
  ('notion', 'Software & SaaS', 'expense', 0),
  ('google ads', 'Marketing', 'expense', 0),
  ('facebook ads', 'Marketing', 'expense', 0),
  ('mailchimp', 'Marketing', 'expense', 0),
  ('hubspot', 'Marketing', 'expense', 0),
  ('law', 'Professional Services', 'expense', 0),
  ('attorney', 'Professional Services', 'expense', 0),
  ('consultant', 'Professional Services', 'expense', 0),
  ('accounting', 'Professional Services', 'expense', 0),
  ('comcast', 'Utilities', 'expense', 0),
  ('verizon', 'Utilities', 'expense', 0),
  ('at&t', 'Utilities', 'expense', 0),
  ('internet', 'Utilities', 'expense', 0),
  ('insurance', 'Insurance', 'expense', 0),
  ('geico', 'Insurance', 'expense', 0),
  ('restaurant', 'Meals & Entertainment', 'expense', 0),
  ('doordash', 'Meals & Entertainment', 'expense', 0),
  ('grubhub', 'Meals & Entertainment', 'expense', 0),
  ('starbucks', 'Meals & Entertainment', 'expense', 0),
  ('apple store', 'Equipment', 'expense', 0),
  ('dell', 'Equipment', 'expense', 0),
  ('best buy', 'Equipment', 'expense', 0),
  ('rent', 'Rent', 'expense', 0),
  ('wework', 'Rent', 'expense', 0),
  ('payroll', 'Payroll', 'expense', 0),
  ('gusto', 'Payroll', 'expense', 0),
  ('adp', 'Payroll', 'expense', 0);
