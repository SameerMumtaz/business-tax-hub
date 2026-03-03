

# Multi-Role Business Sub-Accounts with Crew GPS Check-In/Out

This is a major architectural feature spanning auth, database, routing, and real-time geolocation. It introduces a role-based access system where a business owner (admin) can invite managers and crew members, each with scoped permissions, plus GPS-based job site check-in/out for crew.

---

## Prerequisite: Restore Missing Pages

The Timesheets and Job Scheduler pages/hooks from previous messages are not present in the codebase. These must be recreated first since the crew check-in system depends on `job_sites` and `timesheets` data.

---

## Phase 1: Role & Team Database Schema

New tables via migration:

```sql
-- Enum for roles
CREATE TYPE public.team_role AS ENUM ('admin', 'manager', 'crew');

-- Team members table (links auth users to a business)
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id uuid NOT NULL,        -- the admin/owner's user_id
  member_user_id uuid NOT NULL,           -- the invited user's auth id
  role team_role NOT NULL DEFAULT 'crew',
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'invited', -- invited | active | deactivated
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

-- RLS: admin sees all their team; members see their own row
CREATE POLICY "Admin manages team" ON public.team_members FOR ALL
  USING (auth.uid() = business_user_id OR auth.uid() = member_user_id)
  WITH CHECK (auth.uid() = business_user_id);

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
  status text NOT NULL DEFAULT 'checked_in', -- checked_in | checked_out
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crew_checkins ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crew_checkins;

-- RLS for checkins: crew can manage own; admin/manager can read all for their business
CREATE POLICY "Crew manages own checkins" ON public.crew_checkins FOR ALL
  USING (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = crew_checkins.team_member_id
      AND (tm.member_user_id = auth.uid() OR tm.business_user_id = auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = crew_checkins.team_member_id
      AND (tm.member_user_id = auth.uid() OR tm.business_user_id = auth.uid()))
  );
```

Also add `team_member_id` to `profiles` or use the `team_members` table to associate crew users with a business when they accept an invite.

---

## Phase 2: Invitation Flow

**Edge Function**: `supabase/functions/invite-crew/index.ts`
- Admin/manager calls this with email + role + business_user_id
- Creates a `team_members` row with status `invited`
- Sends an invite email (using Supabase Auth `inviteUserByEmail` or a magic link with metadata)
- When the invited user signs up/logs in, their `member_user_id` is populated and status becomes `active`

**Auth Changes**:
- Update `ProfileGateProvider` to also check if the logged-in user is a team member of any business (query `team_members` where `member_user_id = auth.uid()`)
- If they are a crew/manager member, route them to the appropriate scoped dashboard instead of requiring account type selection

---

## Phase 3: Role-Based Route Protection & Sidebars

**Permission Map**:

```text
Feature              | Admin | Manager | Crew
---------------------|-------|---------|-----
Dashboard (full)     |   ✓   |         |
Import / Categorize  |   ✓   |         |
Money In/Out         |   ✓   |         |
Reports / Tax        |   ✓   |         |
Invoicing            |   ✓   |    ✓    |
Job Scheduler        |   ✓   |    ✓    |
Timesheets           |   ✓   |    ✓    |
Team Management      |   ✓   |    ✓*   | (* invite crew only)
Crew Check-in/out    |       |         |   ✓
Crew Dashboard       |       |         |   ✓
Manager Map View     |   ✓   |    ✓    |
```

**Implementation**:
- New `useTeamRole` hook: queries `team_members` for current user, returns `{ role, businessUserId, isTeamMember }`
- New `CrewSidebar.tsx` and `ManagerSidebar.tsx` components with scoped nav links
- Update `ProtectedRoute` to check team role and restrict route access accordingly
- Admin sees full `AppSidebar` as today; managers see a subset; crew sees only their check-in dashboard

---

## Phase 4: Crew Check-In/Out with GPS

**New Page**: `src/pages/CrewDashboardPage.tsx`
- Shows today's assigned jobs (from `job_assignments` where worker matches the crew member)
- Each job card has a "Check In" / "Check Out" button
- **Check In flow**:
  1. Request browser GPS via `navigator.geolocation.getCurrentPosition()`
  2. Calculate distance to job site coordinates (Haversine formula)
  3. If within geofence radius (e.g. 150 meters), allow check-in
  4. Insert into `crew_checkins` with lat/lng/time
  5. Show confirmation with job site name
- **Check Out flow**:
  1. Capture GPS again
  2. Update the `crew_checkins` row with `check_out_*` fields
  3. Calculate `total_hours = (check_out_time - check_in_time)` in hours
  4. Display summary: "Checked out - X.X hours worked today"

**Geofence Logic** (client-side utility):
```typescript
function haversineDistance(lat1, lng1, lat2, lng2): number // meters
function isWithinGeofence(crewLat, crewLng, siteLat, siteLng, radiusMeters = 150): boolean
```

**Note**: Job sites will need `latitude` and `longitude` columns added to `job_sites` table. These can be entered manually or via a geocoding step when creating a site.

---

## Phase 5: Manager/Admin Map Dashboard

**New Page**: `src/pages/CrewMapPage.tsx`
- Accessible to admin and manager roles
- Uses Supabase realtime subscription on `crew_checkins` to show live crew locations
- Renders crew positions on a map (using a simple Leaflet/OpenStreetMap embed or a custom dot-grid)
- Filter by job site
- Table view showing: crew member, job site, check-in time, status (on-site/off-site)
- Export GPS trail data as CSV for verification

---

## Phase 6: Team Management Page

**New Page**: `src/pages/TeamPage.tsx`
- Admin view: list all team members, invite new ones (email + role selector), deactivate members, change roles
- Manager view: invite crew only, see crew list
- Shows each member's status (invited/active), role badge, and last check-in

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/...team_roles.sql` | Schema for team_members, crew_checkins, job_sites lat/lng |
| `supabase/functions/invite-crew/index.ts` | Invitation edge function |
| `src/hooks/useTeamRole.ts` | Hook to get current user's team role |
| `src/hooks/useCrewCheckins.ts` | Hook for check-in/out CRUD + realtime |
| `src/pages/CrewDashboardPage.tsx` | Crew member's check-in/out UI |
| `src/pages/CrewMapPage.tsx` | Manager/admin live crew map |
| `src/pages/TeamPage.tsx` | Team management + invitations |
| `src/components/CrewSidebar.tsx` | Scoped nav for crew role |
| `src/components/ManagerSidebar.tsx` | Scoped nav for manager role |
| `src/lib/geofence.ts` | Haversine distance + geofence check |

**Modified Files**: `ProtectedRoute.tsx` (role-based routing), `App.tsx` (new routes), `AppSidebar.tsx` (team link), `job_sites` table (add lat/lng columns), `AuthPage.tsx` (handle invite acceptance).

---

## Implementation Order

1. DB migration (team_members, crew_checkins, job_sites lat/lng)
2. `useTeamRole` hook + update `ProtectedRoute` for role awareness
3. Team management page with invite flow
4. Crew dashboard with GPS check-in/out + geofence utility
5. Manager map view with realtime crew locations
6. Role-scoped sidebars and route guards

