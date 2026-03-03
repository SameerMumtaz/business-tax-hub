-- Add pay_status column to invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS pay_status text NOT NULL DEFAULT 'unpaid',
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Add RLS policy for public viewing of invoices by share_token
CREATE POLICY "Anyone can view invoices by share token"
ON public.invoices FOR SELECT
USING (share_token IS NOT NULL);

-- Add RLS policy for public read of invoice line items via shared invoices
CREATE POLICY "Anyone can view invoice line items for shared invoices"
ON public.invoice_line_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM invoices
  WHERE invoices.id = invoice_line_items.invoice_id
  AND invoices.share_token IS NOT NULL
));