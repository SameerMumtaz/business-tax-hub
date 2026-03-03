
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS personal_address text,
  ADD COLUMN IF NOT EXISTS personal_city text,
  ADD COLUMN IF NOT EXISTS personal_state text,
  ADD COLUMN IF NOT EXISTS personal_zip text,
  ADD COLUMN IF NOT EXISTS ssn_last4 text,
  ADD COLUMN IF NOT EXISTS filing_status text DEFAULT 'single';
