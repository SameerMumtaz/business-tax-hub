
-- Enum for team roles
CREATE TYPE public.team_role AS ENUM ('admin', 'manager', 'crew');

-- Team members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id uuid NOT NULL,
  member_user_id uuid,
  role team_role NOT NULL DEFAULT 'crew',
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'invited',
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Security definer function to check team membership
CREATE OR REPLACE FUNCTION public.get_team_role(_user_id uuid, _business_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.team_members
  WHERE member_user_id = _user_id AND business_user_id = _business_id AND status = 'active'
  LIMIT 1;
$$;

-- RLS policies for team_members
CREATE POLICY "Admin manages team" ON public.team_members FOR ALL
  USING (auth.uid() = business_user_id OR auth.uid() = member_user_id)
  WITH CHECK (auth.uid() = business_user_id);

-- Add lat/lng to job_sites
ALTER TABLE public.job_sites ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.job_sites ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.job_sites ADD COLUMN IF NOT EXISTS geofence_radius numeric DEFAULT 150;

-- GPS check-in/out records
CREATE TABLE public.crew_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id),
  job_site_id uuid REFERENCES public.job_sites(id),
  check_in_time timestamptz NOT NULL DEFAULT now(),
  check_in_lat numeric,
  check_in_lng numeric,
  check_out_time timestamptz,
  check_out_lat numeric,
  check_out_lng numeric,
  total_hours numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'checked_in',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crew_checkins ENABLE ROW LEVEL SECURITY;

-- Enable realtime for crew_checkins
ALTER PUBLICATION supabase_realtime ADD TABLE public.crew_checkins;

-- RLS for checkins
CREATE POLICY "Crew manages own checkins" ON public.crew_checkins FOR ALL
  USING (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = crew_checkins.team_member_id
      AND (tm.member_user_id = auth.uid() OR tm.business_user_id = auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = crew_checkins.team_member_id
      AND (tm.member_user_id = auth.uid() OR tm.business_user_id = auth.uid()))
  );
