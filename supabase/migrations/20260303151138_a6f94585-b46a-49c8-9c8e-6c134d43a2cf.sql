
-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_number text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  status text NOT NULL DEFAULT 'draft',
  issue_date text NOT NULL,
  due_date text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  share_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  matched_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Line items
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices
CREATE POLICY "Users can CRUD own invoices" ON public.invoices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for line items (via join to invoices)
CREATE POLICY "Users can CRUD own invoice line items" ON public.invoice_line_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.user_id = auth.uid()));

-- Updated_at trigger for invoices
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
