
CREATE TABLE design_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject_line TEXT,
  campaign_type TEXT,
  campaign_info TEXT,
  copy_direction TEXT,
  send_date DATE,
  position INTEGER DEFAULT 0,
  preferences JSONB DEFAULT '{}'::jsonb,
  source_session_id UUID REFERENCES ideation_sessions(id),
  campaign_id UUID REFERENCES campaigns(id),
  klaviyo_campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_design_queue_brand ON design_queue_items(brand_id);
CREATE INDEX idx_design_queue_status ON design_queue_items(brand_id, status);

ALTER TABLE design_queue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own queue items" ON design_queue_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access to design queue" ON design_queue_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Validate status
CREATE OR REPLACE FUNCTION public.validate_design_queue_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('queued', 'configured', 'generating', 'generated', 'sent') THEN
    RAISE EXCEPTION 'Invalid design_queue_items status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_design_queue_status_trigger
  BEFORE INSERT OR UPDATE ON design_queue_items
  FOR EACH ROW EXECUTE FUNCTION validate_design_queue_status();

CREATE TRIGGER update_design_queue_updated_at
  BEFORE UPDATE ON design_queue_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
