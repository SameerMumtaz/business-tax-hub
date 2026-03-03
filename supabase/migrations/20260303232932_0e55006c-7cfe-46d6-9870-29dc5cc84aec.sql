-- Booking pages table
CREATE TABLE public.booking_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text UNIQUE NOT NULL,
  business_name text NOT NULL DEFAULT '',
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  available_hours_start text NOT NULL DEFAULT '09:00',
  available_hours_end text NOT NULL DEFAULT '17:00',
  buffer_minutes integer NOT NULL DEFAULT 15,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own booking pages"
ON public.booking_pages FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view active booking pages by slug"
ON public.booking_pages FOR SELECT
USING (active = true);

-- Booking requests table
CREATE TABLE public.booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_page_id uuid NOT NULL REFERENCES public.booking_pages(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  service_name text NOT NULL,
  requested_date text NOT NULL,
  requested_time text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  price numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Owner can manage requests for their booking pages
CREATE POLICY "Users can view own booking requests"
ON public.booking_requests FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.booking_pages bp
  WHERE bp.id = booking_requests.booking_page_id
  AND bp.user_id = auth.uid()
));

CREATE POLICY "Users can update own booking requests"
ON public.booking_requests FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.booking_pages bp
  WHERE bp.id = booking_requests.booking_page_id
  AND bp.user_id = auth.uid()
));

CREATE POLICY "Users can delete own booking requests"
ON public.booking_requests FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.booking_pages bp
  WHERE bp.id = booking_requests.booking_page_id
  AND bp.user_id = auth.uid()
));

-- Anyone can submit a booking request (no auth required)
CREATE POLICY "Anyone can create booking requests"
ON public.booking_requests FOR INSERT
WITH CHECK (true);