
-- Klaviyo connections table
CREATE TABLE public.klaviyo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  api_key_encrypted text NOT NULL,
  cached_lists jsonb DEFAULT '[]'::jsonb,
  cached_segments jsonb DEFAULT '[]'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id)
);

ALTER TABLE public.klaviyo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their klaviyo connections" ON public.klaviyo_connections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = klaviyo_connections.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = klaviyo_connections.brand_id AND brands.user_id = auth.uid()));

-- Brand segment presets table
CREATE TABLE public.brand_segment_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  list_ids text[] DEFAULT '{}',
  segment_ids text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_segment_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their segment presets" ON public.brand_segment_presets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_segment_presets.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_segment_presets.brand_id AND brands.user_id = auth.uid()));

-- Add columns to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS subject_line text,
  ADD COLUMN IF NOT EXISTS preview_text text,
  ADD COLUMN IF NOT EXISTS send_list_ids text[],
  ADD COLUMN IF NOT EXISTS send_segment_ids text[],
  ADD COLUMN IF NOT EXISTS klaviyo_template_id text,
  ADD COLUMN IF NOT EXISTS klaviyo_campaign_id text;
