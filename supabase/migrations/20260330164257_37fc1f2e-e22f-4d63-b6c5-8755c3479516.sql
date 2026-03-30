ALTER TABLE public.jobs ADD COLUMN billing_interval text DEFAULT null;
ALTER TABLE public.job_templates ADD COLUMN billing_interval text DEFAULT null;