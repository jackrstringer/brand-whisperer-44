
ALTER TABLE public.klaviyo_connections
  ADD COLUMN IF NOT EXISTS quick_stats jsonb DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_klaviyo_sync_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sync_status NOT IN ('pending', 'syncing', 'complete', 'failed', 'analyzing', 'compiling') THEN
    RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
  END IF;
  RETURN NEW;
END;
$function$;
