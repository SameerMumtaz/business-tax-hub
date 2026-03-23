
CREATE OR REPLACE FUNCTION public.update_job_status_on_checkin(_job_id uuid, _new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _new_status NOT IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'Invalid status: %', _new_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.job_assignments ja
    JOIN public.team_members tm ON tm.id = ja.worker_id
    WHERE ja.job_id = _job_id
      AND tm.member_user_id = auth.uid()
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this job';
  END IF;

  -- Only update status for non-recurring (one_time) jobs.
  -- Recurring jobs stay 'scheduled' because each instance must be completed independently.
  UPDATE public.jobs SET status = _new_status, updated_at = now()
  WHERE id = _job_id
    AND job_type = 'one_time';
END;
$$;
