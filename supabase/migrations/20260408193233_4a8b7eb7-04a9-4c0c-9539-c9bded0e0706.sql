-- Add campaign_mode and flow_config columns to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS campaign_mode text NOT NULL DEFAULT 'campaign',
  ADD COLUMN IF NOT EXISTS flow_config jsonb;

-- Use a validation trigger instead of CHECK constraint for campaign_mode
CREATE OR REPLACE FUNCTION public.validate_campaign_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.campaign_mode NOT IN ('campaign', 'flow') THEN
    RAISE EXCEPTION 'Invalid campaign_mode: %. Must be campaign or flow.', NEW.campaign_mode;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_campaign_mode
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_campaign_mode();