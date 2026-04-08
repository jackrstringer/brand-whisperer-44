ALTER TABLE brand_intelligence
  ADD COLUMN IF NOT EXISTS campaign_report_html text,
  ADD COLUMN IF NOT EXISTS campaign_report_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_report_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS campaign_report_error text;

-- Add validation trigger for campaign_report_status
CREATE OR REPLACE FUNCTION public.validate_campaign_report_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.campaign_report_status IS NOT NULL AND NEW.campaign_report_status NOT IN ('pending', 'generating', 'complete', 'failed') THEN
    RAISE EXCEPTION 'Invalid campaign_report_status: %', NEW.campaign_report_status;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_campaign_report_status_trigger
  BEFORE INSERT OR UPDATE ON brand_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_campaign_report_status();