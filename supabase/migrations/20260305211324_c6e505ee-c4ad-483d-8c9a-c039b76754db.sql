ALTER TABLE public.jobs
ADD COLUMN start_time text DEFAULT NULL,
ADD COLUMN estimated_hours numeric DEFAULT NULL;