
-- Create brands table
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own brands" ON public.brands FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own brands" ON public.brands FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own brands" ON public.brands FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own brands" ON public.brands FOR DELETE USING (auth.uid() = user_id);

-- Create brand_profiles table
CREATE TABLE public.brand_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  system_prompt TEXT,
  raw_extraction JSONB,
  reference_image_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their brand profiles" ON public.brand_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = brand_profiles.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can create brand profiles" ON public.brand_profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = brand_profiles.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can update their brand profiles" ON public.brand_profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = brand_profiles.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can delete their brand profiles" ON public.brand_profiles FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = brand_profiles.brand_id AND brands.user_id = auth.uid()));

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Campaign',
  brief TEXT,
  goal TEXT,
  html TEXT,
  html_history JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their campaigns" ON public.campaigns FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = campaigns.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can create campaigns" ON public.campaigns FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = campaigns.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can update their campaigns" ON public.campaigns FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = campaigns.brand_id AND brands.user_id = auth.uid()));
CREATE POLICY "Users can delete their campaigns" ON public.campaigns FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = campaigns.brand_id AND brands.user_id = auth.uid()));

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their chat messages" ON public.chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaigns
    JOIN public.brands ON brands.id = campaigns.brand_id
    WHERE campaigns.id = chat_messages.campaign_id AND brands.user_id = auth.uid()
  ));
CREATE POLICY "Users can create chat messages" ON public.chat_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns
    JOIN public.brands ON brands.id = campaigns.brand_id
    WHERE campaigns.id = chat_messages.campaign_id AND brands.user_id = auth.uid()
  ));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for brand reference images
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-references', 'brand-references', true);

CREATE POLICY "Users can upload brand references" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-references' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Brand references are publicly accessible" ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-references');
CREATE POLICY "Users can delete their brand references" ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-references' AND auth.uid()::text = (storage.foldername(name))[1]);
