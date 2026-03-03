
-- Allow crew/manager members to SELECT job_assignments where they are the worker
CREATE POLICY "Crew can view own assignments"
ON public.job_assignments FOR SELECT
TO authenticated
USING (
  worker_id IN (
    SELECT id FROM public.team_members 
    WHERE member_user_id = auth.uid() AND status = 'active'
  )
);

-- Allow crew/manager members to SELECT jobs they are assigned to
CREATE POLICY "Crew can view assigned jobs"
ON public.jobs FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT ja.job_id FROM public.job_assignments ja
    JOIN public.team_members tm ON tm.id = ja.worker_id
    WHERE tm.member_user_id = auth.uid() AND tm.status = 'active'
  )
);

-- Allow crew/manager members to SELECT job_sites for their assigned jobs
CREATE POLICY "Crew can view assigned job sites"
ON public.job_sites FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT j.site_id FROM public.jobs j
    JOIN public.job_assignments ja ON ja.job_id = j.id
    JOIN public.team_members tm ON tm.id = ja.worker_id
    WHERE tm.member_user_id = auth.uid() AND tm.status = 'active'
  )
);
