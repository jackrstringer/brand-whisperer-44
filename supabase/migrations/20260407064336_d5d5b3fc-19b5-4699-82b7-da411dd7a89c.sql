
-- Create brand_intelligence table
CREATE TABLE public.brand_intelligence (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  ai_research jsonb,
  survey_answers jsonb,
  merged_profile jsonb,
  compiled_context text,
  research_status text NOT NULL DEFAULT 'pending',
  ai_research_confidence text,
  last_researched_at timestamptz,
  last_surveyed_at timestamptz,
  last_compiled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Use a validation trigger instead of CHECK constraint for research_status
CREATE OR REPLACE FUNCTION public.validate_research_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.research_status NOT IN ('pending', 'ai_complete', 'survey_complete', 'complete') THEN
    RAISE EXCEPTION 'Invalid research_status: %', NEW.research_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_brand_intelligence_status
BEFORE INSERT OR UPDATE ON public.brand_intelligence
FOR EACH ROW
EXECUTE FUNCTION public.validate_research_status();

-- Auto-update updated_at
CREATE TRIGGER update_brand_intelligence_updated_at
BEFORE UPDATE ON public.brand_intelligence
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.brand_intelligence ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their brand intelligence"
ON public.brand_intelligence FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.brands WHERE brands.id = brand_intelligence.brand_id AND brands.user_id = auth.uid()
));

CREATE POLICY "Users can create brand intelligence"
ON public.brand_intelligence FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.brands WHERE brands.id = brand_intelligence.brand_id AND brands.user_id = auth.uid()
));

CREATE POLICY "Users can update their brand intelligence"
ON public.brand_intelligence FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.brands WHERE brands.id = brand_intelligence.brand_id AND brands.user_id = auth.uid()
));

CREATE POLICY "Users can delete their brand intelligence"
ON public.brand_intelligence FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.brands WHERE brands.id = brand_intelligence.brand_id AND brands.user_id = auth.uid()
));

-- Service role policy for edge functions
CREATE POLICY "Service role full access to brand intelligence"
ON public.brand_intelligence FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
