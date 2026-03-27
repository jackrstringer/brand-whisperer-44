ALTER TABLE public.reference_campaigns
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS campaign_type text,
  ADD COLUMN IF NOT EXISTS message_type text,
  ADD COLUMN IF NOT EXISTS extracted_copy text,
  ADD COLUMN IF NOT EXISTS ai_metadata jsonb;