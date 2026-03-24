ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS speed_mode text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS pinned_asset_urls text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extra_copy text DEFAULT NULL;