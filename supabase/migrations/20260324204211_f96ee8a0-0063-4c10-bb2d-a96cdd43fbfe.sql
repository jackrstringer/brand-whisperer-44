
-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their products" ON public.products FOR SELECT USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = products.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "Users can create products" ON public.products FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = products.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "Users can update their products" ON public.products FOR UPDATE USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = products.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "Users can delete their products" ON public.products FOR DELETE USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = products.brand_id AND brands.user_id = auth.uid())
);

-- Product assets table
CREATE TABLE public.product_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT,
  description TEXT,
  dominant_colors TEXT[],
  ai_category TEXT,
  composition_notes TEXT,
  transparent_bg BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their product assets" ON public.product_assets FOR SELECT USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = product_assets.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "Users can create product assets" ON public.product_assets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = product_assets.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "Users can update their product assets" ON public.product_assets FOR UPDATE USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = product_assets.brand_id AND brands.user_id = auth.uid())
);
CREATE POLICY "Users can delete their product assets" ON public.product_assets FOR DELETE USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = product_assets.brand_id AND brands.user_id = auth.uid())
);
