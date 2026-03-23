-- Fix infinite recursion in team_members SELECT policies by using SECURITY DEFINER helpers

create or replace function public.get_my_team_memberships(_user_id uuid)
returns table (
  id uuid,
  business_user_id uuid,
  role public.team_role,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select tm.id, tm.business_user_id, tm.role, tm.status
  from public.team_members tm
  where tm.member_user_id = _user_id
$$;

create or replace function public.can_manager_view_team_member(_user_id uuid, _target_business_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.get_my_team_memberships(_user_id) me
    where me.business_user_id = _target_business_user_id
      and me.status = 'active'
      and me.role = 'manager'
  )
$$;

create or replace function public.can_crew_view_team_member(_user_id uuid, _target_team_member_id uuid, _target_business_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.get_my_team_memberships(_user_id) me
    where me.business_user_id = _target_business_user_id
      and me.status = 'active'
      and me.role = 'crew'
      and (
        exists (
          select 1
          from public.team_members self_tm
          where self_tm.id = _target_team_member_id
            and self_tm.member_user_id = _user_id
        )
        or exists (
          select 1
          from public.job_assignments ja1
          join public.job_assignments ja2 on ja2.job_id = ja1.job_id
          where ja1.worker_id = me.id
            and ja2.worker_id = _target_team_member_id
        )
      )
  )
$$;

drop policy if exists "Managers can view all team members" on public.team_members;
drop policy if exists "Crew can view co-assigned teammates" on public.team_members;

create policy "Managers can view all team members"
on public.team_members
for select
to authenticated
using (
  public.can_manager_view_team_member(auth.uid(), business_user_id)
);

create policy "Crew can view co-assigned teammates"
on public.team_members
for select
to authenticated
using (
  public.can_crew_view_team_member(auth.uid(), id, business_user_id)
);