
CREATE TABLE public.klaviyo_product_store (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  klaviyo_account_id TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  image_url TEXT,
  product_url TEXT,
  price NUMERIC,
  sku TEXT,
  brand TEXT,
  categories TEXT[],
  is_junk BOOLEAN NOT NULL DEFAULT false,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  checkout_count INTEGER NOT NULL DEFAULT 0,
  last_synced TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, product_id)
);

ALTER TABLE public.klaviyo_product_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to product store"
  ON public.klaviyo_product_store FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view their product store"
  ON public.klaviyo_product_store FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM brands WHERE brands.id = klaviyo_product_store.brand_id AND brands.user_id = auth.uid()
  ));

CREATE INDEX idx_klaviyo_product_store_brand ON public.klaviyo_product_store(brand_id);
CREATE INDEX idx_klaviyo_product_store_junk ON public.klaviyo_product_store(brand_id, is_junk);

CREATE TRIGGER update_klaviyo_product_store_updated_at
  BEFORE UPDATE ON public.klaviyo_product_store
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
