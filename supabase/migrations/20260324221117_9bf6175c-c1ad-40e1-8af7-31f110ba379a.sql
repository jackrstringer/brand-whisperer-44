ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS generation_started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS generation_duration_secs integer DEFAULT NULL;