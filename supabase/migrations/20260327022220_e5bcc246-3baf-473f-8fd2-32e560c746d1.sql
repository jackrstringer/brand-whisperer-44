
-- Create reference_campaigns table
CREATE TABLE public.reference_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  brand_name text,
  category text,
  tags text[],
  thumbnail_url text NOT NULL,
  image_urls text[],
  is_published boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.reference_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view published references"
  ON public.reference_campaigns
  FOR SELECT
  TO authenticated
  USING (is_published = true);

CREATE POLICY "Admins can manage all references"
  ON public.reference_campaigns
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create saved_references table
CREATE TABLE public.saved_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  saved_at timestamptz DEFAULT now(),
  UNIQUE(user_id, reference_type, reference_id)
);

ALTER TABLE public.saved_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved references"
  ON public.saved_references
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add reference columns to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS reference_campaign_id uuid,
  ADD COLUMN IF NOT EXISTS reference_campaign_type text,
  ADD COLUMN IF NOT EXISTS reference_strength integer;

-- Create storage bucket for reference campaign images
INSERT INTO storage.buckets (id, name, public) VALUES ('reference-campaigns', 'reference-campaigns', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for reference-campaigns bucket
CREATE POLICY "Anyone can view reference campaign images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'reference-campaigns');

CREATE POLICY "Authenticated users can upload reference campaign images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reference-campaigns');

CREATE POLICY "Authenticated users can delete reference campaign images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'reference-campaigns');

-- Create user_roles table for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
