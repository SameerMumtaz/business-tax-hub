-- Business owners can view all photos on their jobs
CREATE POLICY "Business owners can view job photos"
ON public.job_photos FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_photos.job_id
      AND j.user_id = auth.uid()
  )
);

-- Managers can view job photos for their business
CREATE POLICY "Managers can view job photos"
ON public.job_photos FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_photos.job_id
      AND public.can_manager_view_team_member(auth.uid(), j.user_id)
  )
);