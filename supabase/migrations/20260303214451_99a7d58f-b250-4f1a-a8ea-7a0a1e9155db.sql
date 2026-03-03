-- Scope categorization rule uniqueness per business/user instead of globally
-- 1) Remove inaccessible orphaned rows (cannot pass RLS anyway)
DELETE FROM public.categorization_rules
WHERE user_id IS NULL;

-- 2) Enforce ownership on every rule row
ALTER TABLE public.categorization_rules
ALTER COLUMN user_id SET NOT NULL;

-- 3) Replace global uniqueness (vendor_pattern,type) with per-user uniqueness
DROP INDEX IF EXISTS public.idx_categorization_rules_pattern_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorization_rules_user_pattern_type
ON public.categorization_rules (user_id, vendor_pattern, type);