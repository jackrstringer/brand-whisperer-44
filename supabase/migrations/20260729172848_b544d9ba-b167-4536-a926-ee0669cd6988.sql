
ALTER TABLE public.campaign_slices
  ADD COLUMN IF NOT EXISTS row_index integer,
  ADD COLUMN IF NOT EXISTS column_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS columns_in_row integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS region_label text;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS html_render_url text,
  ADD COLUMN IF NOT EXISTS slice_plan_html jsonb;
