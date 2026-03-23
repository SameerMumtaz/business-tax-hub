-- Drop the broad policy and replace with role-scoped ones
DROP POLICY IF EXISTS "Team members can view fellow team members" ON public.team_members;

-- Managers can see all team members in their business
CREATE POLICY "Managers can view all team members"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members me
    WHERE me.member_user_id = auth.uid()
      AND me.business_user_id = team_members.business_user_id
      AND me.status = 'active'
      AND me.role = 'manager'
  )
);

-- Crew can only see teammates assigned to the same jobs
CREATE POLICY "Crew can view co-assigned teammates"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members me
    WHERE me.member_user_id = auth.uid()
      AND me.business_user_id = team_members.business_user_id
      AND me.status = 'active'
      AND me.role = 'crew'
      AND (
        -- They can always see their own row
        team_members.member_user_id = auth.uid()
        OR
        -- Or teammates assigned to same jobs
        team_members.id IN (
          SELECT ja2.worker_id FROM public.job_assignments ja2
          WHERE ja2.job_id IN (
            SELECT ja1.job_id FROM public.job_assignments ja1
            WHERE ja1.worker_id = me.id
          )
        )
      )
  )
);