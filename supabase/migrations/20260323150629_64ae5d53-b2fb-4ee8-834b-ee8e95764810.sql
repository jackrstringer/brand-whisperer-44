
-- New table: brand_assets (categorized image storage per brand)
CREATE TABLE public.brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their brand assets" ON public.brand_assets FOR SELECT USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_assets.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can create brand assets" ON public.brand_assets FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_assets.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can delete their brand assets" ON public.brand_assets FOR DELETE USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_assets.brand_id AND brands.user_id = auth.uid()));

-- New table: user_preferences (account-wide learned preferences)
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- New table: brand_feedback (stores feedback responses from refinement)
CREATE TABLE public.brand_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  round INT NOT NULL DEFAULT 1,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachment_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their brand feedback" ON public.brand_feedback FOR SELECT USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_feedback.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can create brand feedback" ON public.brand_feedback FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_feedback.brand_id AND brands.user_id = auth.uid()));

-- Alter brands: add website_url and source_types
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS source_types TEXT[];

-- Alter brand_profiles: add brand_guide_url
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS brand_guide_url TEXT;

-- Alter campaigns: add reference_campaign_ids
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS reference_campaign_ids TEXT[];

-- Create brand-assets storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true) ON CONFLICT (id) DO NOTHING;

-- Storage RLS for brand-assets bucket
CREATE POLICY "Anyone can read brand assets" ON storage.objects FOR SELECT USING (bucket_id = 'brand-assets');
CREATE POLICY "Authenticated users can upload brand assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete their brand assets" ON storage.objects FOR DELETE USING (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');
