
-- Fix research_status trigger to allow all statuses the code actually uses
CREATE OR REPLACE FUNCTION public.validate_research_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.research_status NOT IN ('pending', 'researching', 'ai_complete', 'survey_complete', 'compiling', 'complete', 'failed') THEN
    RAISE EXCEPTION 'Invalid research_status: %', NEW.research_status;
  END IF;
  RETURN NEW;
END;
$function$;

-- Add explicit processing status columns to brand_profiles
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS processing_error text;
