ALTER TABLE public.crew_checkins
ADD COLUMN IF NOT EXISTS occurrence_date text;

ALTER TABLE public.job_photos
ADD COLUMN IF NOT EXISTS occurrence_date text;

UPDATE public.crew_checkins
SET occurrence_date = COALESCE(occurrence_date, (check_in_time AT TIME ZONE 'UTC')::date::text)
WHERE occurrence_date IS NULL;

UPDATE public.job_photos
SET occurrence_date = COALESCE(occurrence_date, uploaded_at::date::text)
WHERE occurrence_date IS NULL;

ALTER TABLE public.crew_checkins
ALTER COLUMN occurrence_date SET DEFAULT ((now() AT TIME ZONE 'UTC')::date::text);

ALTER TABLE public.job_photos
ALTER COLUMN occurrence_date SET DEFAULT ((now() AT TIME ZONE 'UTC')::date::text);

CREATE INDEX IF NOT EXISTS idx_crew_checkins_job_occurrence_date
ON public.crew_checkins (job_id, occurrence_date);

CREATE INDEX IF NOT EXISTS idx_job_photos_job_occurrence_date_type
ON public.job_photos (job_id, occurrence_date, photo_type);
