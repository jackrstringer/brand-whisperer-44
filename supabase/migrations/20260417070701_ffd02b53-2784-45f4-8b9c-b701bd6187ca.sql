-- Flows feature: stores AI-built email flow skeletons and their generated emails.

CREATE TABLE public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  flow_type text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  skeleton_markdown text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flows_brand_id ON public.flows(brand_id);

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage flows via brand"
  ON public.flows FOR ALL
  TO public
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = flows.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = flows.brand_id AND brands.user_id = auth.uid()));

CREATE POLICY "Service role full access to flows"
  ON public.flows FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Status validation trigger (avoid CHECK constraint per project rules)
CREATE OR REPLACE FUNCTION public.validate_flow_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'skeleton_ready', 'generating', 'complete') THEN
    RAISE EXCEPTION 'Invalid flow status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER flows_validate_status
  BEFORE INSERT OR UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.validate_flow_status();

CREATE TRIGGER flows_set_updated_at
  BEFORE UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Flow emails: parsed nodes from the skeleton + generated HTML.

CREATE TABLE public.flow_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  sequence_index integer NOT NULL,
  node_type text NOT NULL,
  label text,
  timing text,
  job text,
  subject_direction text,
  sections jsonb,
  notes text,
  html text,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  generation_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flow_emails_flow_id ON public.flow_emails(flow_id);

ALTER TABLE public.flow_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage flow_emails via brand"
  ON public.flow_emails FOR ALL
  TO public
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = flow_emails.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = flow_emails.brand_id AND brands.user_id = auth.uid()));

CREATE POLICY "Service role full access to flow_emails"
  ON public.flow_emails FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.validate_flow_email_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.node_type NOT IN ('email', 'delay', 'split', 'sms') THEN
    RAISE EXCEPTION 'Invalid flow_email node_type: %', NEW.node_type;
  END IF;
  IF NEW.generation_status NOT IN ('pending', 'generating', 'complete', 'failed') THEN
    RAISE EXCEPTION 'Invalid flow_email generation_status: %', NEW.generation_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER flow_emails_validate_fields
  BEFORE INSERT OR UPDATE ON public.flow_emails
  FOR EACH ROW EXECUTE FUNCTION public.validate_flow_email_fields();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.flows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_emails;
ALTER TABLE public.flows REPLICA IDENTITY FULL;
ALTER TABLE public.flow_emails REPLICA IDENTITY FULL;