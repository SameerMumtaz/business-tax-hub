
-- Drop the recursive policies
DROP POLICY IF EXISTS "Crew can view own assignments" ON public.job_assignments;
DROP POLICY IF EXISTS "Crew can view assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Crew can view assigned job sites" ON public.job_sites;

-- Create a security definer function to check if user is a team member of the job owner
CREATE OR REPLACE FUNCTION public.is_team_member_of(_user_id uuid, _business_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE member_user_id = _user_id
      AND business_user_id = _business_user_id
      AND status = 'active'
  );
$$;

-- Create a security definer function to get business_user_ids for a team member
CREATE OR REPLACE FUNCTION public.get_business_ids_for_member(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_user_id FROM public.team_members
  WHERE member_user_id = _user_id AND status = 'active';
$$;

-- Jobs: crew/manager can SELECT jobs owned by their business
CREATE POLICY "Team members can view business jobs"
ON public.jobs FOR SELECT
TO authenticated
USING (
  user_id IN (SELECT public.get_business_ids_for_member(auth.uid()))
);

-- Job sites: crew/manager can SELECT sites owned by their business
CREATE POLICY "Team members can view business job sites"
ON public.job_sites FOR SELECT
TO authenticated
USING (
  user_id IN (SELECT public.get_business_ids_for_member(auth.uid()))
);

-- Job assignments: crew/manager can SELECT assignments for business jobs
-- Use a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.get_business_job_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id FROM public.jobs j
  WHERE j.user_id IN (
    SELECT business_user_id FROM public.team_members
    WHERE member_user_id = _user_id AND status = 'active'
  );
$$;

CREATE POLICY "Team members can view business job assignments"
ON public.job_assignments FOR SELECT
TO authenticated
USING (
  job_id IN (SELECT public.get_business_job_ids(auth.uid()))
);
