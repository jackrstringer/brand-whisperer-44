ALTER TABLE public.brand_intelligence
ADD COLUMN IF NOT EXISTS site_context text,
ADD COLUMN IF NOT EXISTS site_context_fetched_at timestamptz;