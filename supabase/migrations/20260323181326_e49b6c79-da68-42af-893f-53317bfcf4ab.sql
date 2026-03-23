CREATE POLICY "Team members can view fellow team members"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  business_user_id IN (
    SELECT get_business_ids_for_member(auth.uid())
  )
);