ALTER TABLE public.brand_assets ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.brand_assets ADD COLUMN IF NOT EXISTS dominant_colors text[];
ALTER TABLE public.brand_assets ADD COLUMN IF NOT EXISTS ai_category text;