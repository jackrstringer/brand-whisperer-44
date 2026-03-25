CREATE POLICY "Users can update their brand assets"
ON public.brand_assets
FOR UPDATE
TO public
USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_assets.brand_id AND brands.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_assets.brand_id AND brands.user_id = auth.uid()));