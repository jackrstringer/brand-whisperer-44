
-- shopify_connections: stores OAuth tokens per brand
CREATE TABLE public.shopify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL UNIQUE,
  shop_domain text NOT NULL,
  access_token text NOT NULL,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz
);
ALTER TABLE public.shopify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their shopify connections"
  ON public.shopify_connections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = shopify_connections.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = shopify_connections.brand_id AND brands.user_id = auth.uid()));

-- shopify_products: synced product catalog
CREATE TABLE public.shopify_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  shopify_product_id text NOT NULL,
  title text NOT NULL,
  handle text,
  product_type text,
  tags text[],
  variants jsonb,
  status text,
  shopify_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, shopify_product_id)
);
ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their shopify products"
  ON public.shopify_products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = shopify_products.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = shopify_products.brand_id AND brands.user_id = auth.uid()));

-- shopify_product_images: per-image with AI classification
CREATE TABLE public.shopify_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.shopify_products(id) ON DELETE CASCADE NOT NULL,
  shopify_image_id text,
  original_url text NOT NULL,
  imagekit_url text,
  processed_url text,
  image_type text,
  has_white_bg boolean,
  has_transparent_bg boolean,
  background_type text,
  subject_description text,
  variant_shown text,
  dominant_colors text[],
  usable_as_hero boolean,
  usable_as_product_shot boolean,
  confidence text,
  processing_status text NOT NULL DEFAULT 'pending',
  classified_at timestamptz,
  UNIQUE (product_id, shopify_image_id)
);
ALTER TABLE public.shopify_product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their shopify product images"
  ON public.shopify_product_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = shopify_product_images.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = shopify_product_images.brand_id AND brands.user_id = auth.uid()));
