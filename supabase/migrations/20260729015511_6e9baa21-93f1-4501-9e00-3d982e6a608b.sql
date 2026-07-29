
-- Cache the brand file (palette + identity assets + style refs) per campaign so
-- slice regeneration doesn't have to rebuild it.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS brand_file jsonb;

-- Track the last whole-campaign QA finding on each slice so we can render it
-- in the editor and drive the auto-apply pass.
ALTER TABLE public.campaign_slices
  ADD COLUMN IF NOT EXISTS qa_finding jsonb,
  ADD COLUMN IF NOT EXISTS qa_regenerated_at timestamptz;

-- generation_mode already exists as text; we just start writing 'image_blocks'
-- and 'block_export' into it. No enum change needed.
