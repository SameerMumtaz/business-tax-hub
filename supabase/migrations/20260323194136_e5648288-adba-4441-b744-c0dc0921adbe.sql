
CREATE TABLE public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  business_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deletion requests"
ON public.deletion_requests FOR SELECT
TO authenticated
USING (requester_user_id = auth.uid());

CREATE POLICY "Users can create own deletion requests"
ON public.deletion_requests FOR INSERT
TO authenticated
WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "Business owner can view deletion requests"
ON public.deletion_requests FOR SELECT
TO authenticated
USING (business_user_id = auth.uid());

CREATE POLICY "Business owner can update deletion requests"
ON public.deletion_requests FOR UPDATE
TO authenticated
USING (business_user_id = auth.uid());

CREATE POLICY "Managers can view deletion requests"
ON public.deletion_requests FOR SELECT
TO authenticated
USING (can_manager_view_team_member(auth.uid(), business_user_id));

CREATE POLICY "Managers can update crew deletion requests"
ON public.deletion_requests FOR UPDATE
TO authenticated
USING (can_manager_view_team_member(auth.uid(), business_user_id));
