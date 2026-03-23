ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS brand_guide_html text;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS audit_findings jsonb;