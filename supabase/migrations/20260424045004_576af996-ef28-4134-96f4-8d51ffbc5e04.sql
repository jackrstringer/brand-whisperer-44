ALTER TABLE public.flows
ADD COLUMN IF NOT EXISTS setup_status TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS setup_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_flows_setup_status ON public.flows(setup_status);

CREATE OR REPLACE FUNCTION public.validate_flow_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('draft', 'skeleton_ready', 'generating', 'complete') THEN
    RAISE EXCEPTION 'Invalid flow status: %', NEW.status;
  END IF;
  IF NEW.setup_status NOT IN ('draft', 'researching', 'research_ready', 'needs_confirmation', 'ready_for_skeleton', 'skeleton_ready') THEN
    RAISE EXCEPTION 'Invalid flow setup_status: %', NEW.setup_status;
  END IF;
  RETURN NEW;
END;
$function$;