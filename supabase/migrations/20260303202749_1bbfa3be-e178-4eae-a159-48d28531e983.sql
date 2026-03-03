CREATE POLICY "Anyone authenticated can lookup profiles by bookie_id"
ON public.profiles
FOR SELECT
TO authenticated
USING (bookie_id IS NOT NULL);