
-- Add state_employed column to contractors
ALTER TABLE public.contractors ADD COLUMN state_employed text;

-- Add state_employed column to employees
ALTER TABLE public.employees ADD COLUMN state_employed text;
