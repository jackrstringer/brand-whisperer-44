-- Update the validation trigger to accept new statuses
CREATE OR REPLACE FUNCTION public.validate_design_queue_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('draft', 'designed', 'templated', 'sent', 'generating') THEN
    RAISE EXCEPTION 'Invalid design_queue_items status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

-- Migrate existing data
UPDATE public.design_queue_items SET status = 'draft' WHERE status IN ('queued', 'configured');
UPDATE public.design_queue_items SET status = 'designed' WHERE status = 'generated';