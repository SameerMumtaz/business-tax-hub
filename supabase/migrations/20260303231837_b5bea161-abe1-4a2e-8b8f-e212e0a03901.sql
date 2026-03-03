
-- Quotes table
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  valid_until TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  client_name TEXT NOT NULL DEFAULT '',
  client_email TEXT,
  share_token TEXT DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  converted_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Quote line items table
CREATE TABLE public.quote_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotes
CREATE POLICY "Users can CRUD own quotes" ON public.quotes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow public read via share_token (for the public quote view)
CREATE POLICY "Anyone can view quotes by share token" ON public.quotes
  FOR SELECT USING (share_token IS NOT NULL);

-- RLS policies for quote line items
CREATE POLICY "Users can CRUD own quote line items" ON public.quote_line_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.quotes WHERE quotes.id = quote_line_items.quote_id AND quotes.user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes WHERE quotes.id = quote_line_items.quote_id AND quotes.user_id = auth.uid()
  ));

-- Allow public read of line items for shared quotes
CREATE POLICY "Anyone can view quote line items for shared quotes" ON public.quote_line_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.quotes WHERE quotes.id = quote_line_items.quote_id AND quotes.share_token IS NOT NULL
  ));

-- Auto-increment quote number sequence
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;

-- Updated_at trigger
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
