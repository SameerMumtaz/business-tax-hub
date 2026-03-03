
-- Add bookie_id column to profiles
ALTER TABLE public.profiles ADD COLUMN bookie_id TEXT UNIQUE;

-- Create a function to generate a unique alphanumeric Bookie ID (BK-XXXX format)
CREATE OR REPLACE FUNCTION public.generate_bookie_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INT;
  attempts INT := 0;
BEGIN
  -- Only generate for business accounts
  IF NEW.account_type = 'business' AND NEW.bookie_id IS NULL THEN
    LOOP
      new_id := 'BK-';
      FOR i IN 1..4 LOOP
        new_id := new_id || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      -- Check uniqueness
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE bookie_id = new_id) THEN
        NEW.bookie_id := new_id;
        EXIT;
      END IF;
      attempts := attempts + 1;
      IF attempts > 100 THEN
        RAISE EXCEPTION 'Could not generate unique bookie_id';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-generate bookie_id when account_type is set to business
CREATE TRIGGER generate_bookie_id_trigger
  BEFORE INSERT OR UPDATE OF account_type ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_bookie_id();

-- Generate bookie_ids for existing business profiles that don't have one
UPDATE public.profiles SET bookie_id = NULL WHERE account_type = 'business' AND bookie_id IS NULL;
