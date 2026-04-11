
-- Table 1: ideation_sessions
CREATE TABLE ideation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  initial_brief TEXT,
  nodes JSONB DEFAULT '[]'::jsonb,
  locked_idea JSONB,
  status TEXT NOT NULL DEFAULT 'exploring',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ideation_sessions_brand ON ideation_sessions(brand_id);
ALTER TABLE ideation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own ideation sessions" ON ideation_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Validate status
CREATE OR REPLACE FUNCTION public.validate_ideation_session_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('exploring', 'locked') THEN
    RAISE EXCEPTION 'Invalid ideation session status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_ideation_session_status_trigger
  BEFORE INSERT OR UPDATE ON ideation_sessions
  FOR EACH ROW EXECUTE FUNCTION validate_ideation_session_status();

-- Auto-update updated_at
CREATE TRIGGER update_ideation_sessions_updated_at
  BEFORE UPDATE ON ideation_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Table 2: idea_bank
CREATE TABLE idea_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject_line TEXT,
  campaign_type TEXT,
  campaign_info TEXT,
  copy_direction TEXT,
  source_type TEXT DEFAULT 'generated',
  status TEXT DEFAULT 'new',
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_idea_bank_brand ON idea_bank(brand_id);
ALTER TABLE idea_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage idea bank via brand" ON idea_bank FOR ALL USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = idea_bank.brand_id AND brands.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = idea_bank.brand_id AND brands.user_id = auth.uid())
);

-- Validate source_type and status
CREATE OR REPLACE FUNCTION public.validate_idea_bank_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.source_type NOT IN ('generated', 'bank', 'calendar', 'manual') THEN
    RAISE EXCEPTION 'Invalid idea_bank source_type: %', NEW.source_type;
  END IF;
  IF NEW.status NOT IN ('new', 'saved', 'used', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid idea_bank status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_idea_bank_fields_trigger
  BEFORE INSERT OR UPDATE ON idea_bank
  FOR EACH ROW EXECUTE FUNCTION validate_idea_bank_fields();

-- Table 3: creative_decisions
CREATE TABLE creative_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  decision_type TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_creative_decisions_brand ON creative_decisions(brand_id);
ALTER TABLE creative_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage creative decisions via brand" ON creative_decisions FOR ALL USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = creative_decisions.brand_id AND brands.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = creative_decisions.brand_id AND brands.user_id = auth.uid())
);

-- Service role access for edge functions
CREATE POLICY "Service role full access to creative decisions" ON creative_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table 4: brand_calendar
CREATE TABLE brand_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_type TEXT DEFAULT 'holiday',
  auto_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_brand_calendar_brand_date ON brand_calendar(brand_id, event_date);
ALTER TABLE brand_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage brand calendar via brand" ON brand_calendar FOR ALL USING (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_calendar.brand_id AND brands.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM brands WHERE brands.id = brand_calendar.brand_id AND brands.user_id = auth.uid())
);

-- Validate event_type
CREATE OR REPLACE FUNCTION public.validate_brand_calendar_event_type()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.event_type NOT IN ('holiday', 'brand', 'product_launch', 'sale', 'custom') THEN
    RAISE EXCEPTION 'Invalid brand_calendar event_type: %', NEW.event_type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_brand_calendar_event_type_trigger
  BEFORE INSERT OR UPDATE ON brand_calendar
  FOR EACH ROW EXECUTE FUNCTION validate_brand_calendar_event_type();

-- Add columns to brands
ALTER TABLE brands ADD COLUMN IF NOT EXISTS ideation_prompt TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS ideation_prompt_built_at TIMESTAMPTZ;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS idea_generation_status TEXT DEFAULT 'idle';

-- Service role access for edge functions on new tables
CREATE POLICY "Service role full access to ideation sessions" ON ideation_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to idea bank" ON idea_bank FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to brand calendar" ON brand_calendar FOR ALL TO service_role USING (true) WITH CHECK (true);
