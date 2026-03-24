ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS confirmed_properties jsonb DEFAULT NULL;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS extraction_sources text[] DEFAULT NULL;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS figma_url text DEFAULT NULL;