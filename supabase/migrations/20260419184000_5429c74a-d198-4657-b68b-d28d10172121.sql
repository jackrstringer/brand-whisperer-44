ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS reference_image_categories jsonb;

-- Backfill: treat all existing flat reference_image_urls as 'campaign' category
UPDATE public.brand_profiles
SET reference_image_categories = jsonb_build_object('campaign', to_jsonb(reference_image_urls))
WHERE reference_image_categories IS NULL
  AND reference_image_urls IS NOT NULL
  AND array_length(reference_image_urls, 1) > 0;