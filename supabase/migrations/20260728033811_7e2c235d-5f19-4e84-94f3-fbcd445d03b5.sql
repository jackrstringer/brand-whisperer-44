-- 1. Extend campaign_mode validation to include "image"
CREATE OR REPLACE FUNCTION public.validate_campaign_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.campaign_mode NOT IN ('campaign', 'flow', 'image') THEN
    RAISE EXCEPTION 'Invalid campaign_mode: %. Must be campaign, flow, or image.', NEW.campaign_mode;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Add new columns to campaigns for image mode
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS design_system jsonb,
  ADD COLUMN IF NOT EXISTS slice_plan jsonb;

-- 3. Slice archetypes catalog (seeded content, read-only for users)
CREATE TABLE public.email_slice_archetypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  description text,
  default_aspect_ratio text NOT NULL DEFAULT '4:5',
  composition_template text NOT NULL,
  role_hint text,
  usually_has_cta boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_slice_archetypes TO authenticated;
GRANT ALL ON public.email_slice_archetypes TO service_role;
ALTER TABLE public.email_slice_archetypes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read archetypes"
  ON public.email_slice_archetypes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage archetypes"
  ON public.email_slice_archetypes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Materialized generated slices per campaign
CREATE TABLE public.campaign_slices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  position integer NOT NULL,
  archetype_slug text,
  image_url text,
  headline_copy text,
  body_copy text,
  cta_label text,
  cta_url text,
  aspect_ratio text NOT NULL DEFAULT '4:5',
  composition_brief text,
  prompt_used text,
  generation_status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_slices TO authenticated;
GRANT ALL ON public.campaign_slices TO service_role;
ALTER TABLE public.campaign_slices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read slices for their campaigns"
  ON public.campaign_slices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c JOIN public.brands b ON b.id = c.brand_id
    WHERE c.id = campaign_slices.campaign_id AND b.user_id = auth.uid()
  ));
CREATE POLICY "Users insert slices for their campaigns"
  ON public.campaign_slices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c JOIN public.brands b ON b.id = c.brand_id
    WHERE c.id = campaign_slices.campaign_id AND b.user_id = auth.uid()
  ));
CREATE POLICY "Users update slices for their campaigns"
  ON public.campaign_slices FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c JOIN public.brands b ON b.id = c.brand_id
    WHERE c.id = campaign_slices.campaign_id AND b.user_id = auth.uid()
  ));
CREATE POLICY "Users delete slices for their campaigns"
  ON public.campaign_slices FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c JOIN public.brands b ON b.id = c.brand_id
    WHERE c.id = campaign_slices.campaign_id AND b.user_id = auth.uid()
  ));

CREATE INDEX campaign_slices_campaign_position_idx
  ON public.campaign_slices (campaign_id, position);

CREATE TRIGGER campaign_slices_updated_at
  BEFORE UPDATE ON public.campaign_slices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Validate slice generation status
CREATE OR REPLACE FUNCTION public.validate_campaign_slice_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.generation_status NOT IN ('pending','generating','complete','failed') THEN
    RAISE EXCEPTION 'Invalid campaign_slice generation_status: %', NEW.generation_status;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER campaign_slices_validate_status
  BEFORE INSERT OR UPDATE ON public.campaign_slices
  FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_slice_status();