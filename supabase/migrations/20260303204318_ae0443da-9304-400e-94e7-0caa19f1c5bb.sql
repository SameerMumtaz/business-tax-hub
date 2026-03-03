
-- Allow team members to SELECT timesheet_entries where they are the worker
CREATE OR REPLACE FUNCTION public.get_business_timesheet_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id FROM public.timesheets t
  WHERE t.user_id IN (
    SELECT business_user_id FROM public.team_members
    WHERE member_user_id = _user_id AND status = 'active'
  );
$$;

CREATE POLICY "Team members can view business timesheet entries"
ON public.timesheet_entries FOR SELECT
TO authenticated
USING (
  timesheet_id IN (SELECT public.get_business_timesheet_ids(auth.uid()))
);

-- Allow team members to SELECT timesheets from their business
CREATE POLICY "Team members can view business timesheets"
ON public.timesheets FOR SELECT
TO authenticated
USING (
  user_id IN (SELECT public.get_business_ids_for_member(auth.uid()))
);
