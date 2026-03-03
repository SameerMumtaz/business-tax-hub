
-- Add recurring fields to invoices
ALTER TABLE public.invoices ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN recurring_interval text; -- weekly, monthly, quarterly, yearly
ALTER TABLE public.invoices ADD COLUMN recurring_next_date text;
ALTER TABLE public.invoices ADD COLUMN recurring_end_date text;
ALTER TABLE public.invoices ADD COLUMN recurring_parent_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
