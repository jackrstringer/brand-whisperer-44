ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS variant_htmls jsonb DEFAULT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS generation_mode text NOT NULL DEFAULT 'standard';