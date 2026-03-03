ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS worker_type text NOT NULL DEFAULT '1099';
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS pay_rate numeric DEFAULT 0;