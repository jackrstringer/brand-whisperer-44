UPDATE public.campaigns
SET campaign_mode = 'campaign',
    generation_mode = 'image_slices'
WHERE campaign_mode = 'image';

CREATE OR REPLACE FUNCTION public.validate_campaign_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.campaign_mode NOT IN ('campaign', 'flow') THEN
    RAISE EXCEPTION 'Invalid campaign_mode: %. Must be campaign or flow.', NEW.campaign_mode;
  END IF;
  RETURN NEW;
END;
$function$;