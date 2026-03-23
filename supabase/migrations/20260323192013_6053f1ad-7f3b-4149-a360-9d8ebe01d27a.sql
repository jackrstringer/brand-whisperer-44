ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS brand_instructions text;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS qa_checklist jsonb DEFAULT '[]'::jsonb;