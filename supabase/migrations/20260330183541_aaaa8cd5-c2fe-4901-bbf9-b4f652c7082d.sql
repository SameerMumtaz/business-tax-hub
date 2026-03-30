
-- Create tables first
CREATE TABLE public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'crew',
  name text NOT NULL DEFAULT '',
  description text,
  crew_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text DEFAULT '',
  photo_url text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_site_id uuid REFERENCES public.job_sites(id) ON DELETE SET NULL,
  occurrence_date text,
  parent_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.is_channel_member(_user_id uuid, _channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = _channel_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_channel_business_owner(_user_id uuid, _channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channels
    WHERE id = _channel_id AND business_user_id = _user_id
  );
$$;

-- RLS on chat_channels
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their channels" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (
    is_channel_member(auth.uid(), id)
    OR business_user_id = auth.uid()
  );

CREATE POLICY "Business owner can manage channels" ON public.chat_channels
  FOR ALL TO authenticated
  USING (business_user_id = auth.uid())
  WITH CHECK (business_user_id = auth.uid());

CREATE POLICY "Managers can insert channels" ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (can_manager_view_team_member(auth.uid(), business_user_id));

CREATE POLICY "Managers can view channels" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (can_manager_view_team_member(auth.uid(), business_user_id));

-- RLS on chat_channel_members
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view co-members" ON public.chat_channel_members
  FOR SELECT TO authenticated
  USING (
    is_channel_member(auth.uid(), channel_id)
    OR is_channel_business_owner(auth.uid(), channel_id)
  );

CREATE POLICY "Members can update own read status" ON public.chat_channel_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Business owner manages members" ON public.chat_channel_members
  FOR ALL TO authenticated
  USING (is_channel_business_owner(auth.uid(), channel_id))
  WITH CHECK (is_channel_business_owner(auth.uid(), channel_id));

CREATE POLICY "Managers can manage members" ON public.chat_channel_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_channel_members.channel_id
        AND can_manager_view_team_member(auth.uid(), cc.business_user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_channel_members.channel_id
        AND can_manager_view_team_member(auth.uid(), cc.business_user_id)
    )
  );

-- RLS on chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    is_channel_member(auth.uid(), channel_id)
    OR is_channel_business_owner(auth.uid(), channel_id)
  );

CREATE POLICY "Members can send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      is_channel_member(auth.uid(), channel_id)
      OR is_channel_business_owner(auth.uid(), channel_id)
    )
  );

CREATE POLICY "Users can update own messages" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can delete own messages" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE POLICY "Business owner can manage messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (is_channel_business_owner(auth.uid(), channel_id))
  WITH CHECK (is_channel_business_owner(auth.uid(), channel_id));

CREATE POLICY "Managers can view messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_messages.channel_id
        AND can_manager_view_team_member(auth.uid(), cc.business_user_id)
    )
  );

CREATE POLICY "Managers can send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_channels cc
      WHERE cc.id = chat_messages.channel_id
        AND can_manager_view_team_member(auth.uid(), cc.business_user_id)
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;

-- Storage bucket for chat photos
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-photos', 'chat-photos', true);

CREATE POLICY "Authenticated users can upload chat photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-photos');

CREATE POLICY "Anyone can view chat photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-photos');
