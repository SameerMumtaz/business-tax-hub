-- Create job_photos table
CREATE TABLE public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  photo_url text NOT NULL,
  photo_type text NOT NULL DEFAULT 'during',
  caption text,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

-- Owner can CRUD own photos
CREATE POLICY "Users can CRUD own job photos"
ON public.job_photos FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Team members can view photos for jobs they can see
CREATE POLICY "Team members can view job photos"
ON public.job_photos FOR SELECT
USING (
  job_id IN (SELECT get_business_job_ids(auth.uid()))
);

-- Team members can insert photos for jobs they can see
CREATE POLICY "Team members can insert job photos"
ON public.job_photos FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  job_id IN (SELECT get_business_job_ids(auth.uid()))
);

-- Create job-photos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('job-photos', 'job-photos', true);

-- Storage RLS: authenticated users can upload to their own folder
CREATE POLICY "Users can upload job photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can view all job photos (public bucket)
CREATE POLICY "Anyone can view job photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'job-photos');

-- Users can delete own job photos
CREATE POLICY "Users can delete own job photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text);