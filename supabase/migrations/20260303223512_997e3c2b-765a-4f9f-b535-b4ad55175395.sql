
ALTER TABLE public.vehicles
  ADD COLUMN depreciation_method TEXT NOT NULL DEFAULT 'MACRS',
  ADD COLUMN placed_in_service_date TEXT,
  ADD COLUMN business_use_pct NUMERIC NOT NULL DEFAULT 100,
  ADD COLUMN useful_life_years INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN section_179_amount NUMERIC NOT NULL DEFAULT 0;
