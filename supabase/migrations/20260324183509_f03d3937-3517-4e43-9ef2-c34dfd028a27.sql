ALTER TABLE public.job_assignments 
ADD COLUMN IF NOT EXISTS hours_per_day numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS assigned_days text[] DEFAULT NULL;