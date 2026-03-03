
-- Allow anyone (even anon) to update quote status when they know the share_token
CREATE POLICY "Anyone can respond to shared quotes" ON public.quotes
  FOR UPDATE USING (share_token IS NOT NULL)
  WITH CHECK (share_token IS NOT NULL);
