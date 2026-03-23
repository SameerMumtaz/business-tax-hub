DROP POLICY "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications for others in their team"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.business_user_id = user_id AND tm.member_user_id = auth.uid() AND tm.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.business_user_id = auth.uid() AND tm.member_user_id IS NOT NULL
    )
  );