
-- 1. Create client_contacts table
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  role_title text,
  phone text,
  email text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

-- Owner can CRUD own client contacts
CREATE POLICY "Users can CRUD own client contacts"
  ON public.client_contacts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Managers can view client contacts for their business
CREATE POLICY "Managers can view client contacts"
  ON public.client_contacts FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_business_ids_for_member(auth.uid())));

-- Managers can insert/update/delete client contacts for their business
CREATE POLICY "Managers can manage client contacts"
  ON public.client_contacts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.member_user_id = auth.uid()
        AND tm.business_user_id = client_contacts.user_id
        AND tm.status = 'active'
        AND tm.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.member_user_id = auth.uid()
        AND tm.business_user_id = client_contacts.user_id
        AND tm.status = 'active'
        AND tm.role IN ('manager', 'admin')
    )
  );

-- 2. Grant managers read/write access to clients table
CREATE POLICY "Managers can view clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT get_business_ids_for_member(auth.uid())));

CREATE POLICY "Managers can manage clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.member_user_id = auth.uid()
        AND tm.business_user_id = clients.user_id
        AND tm.status = 'active'
        AND tm.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.member_user_id = auth.uid()
        AND tm.business_user_id = clients.user_id
        AND tm.status = 'active'
        AND tm.role IN ('manager', 'admin')
    )
  );
