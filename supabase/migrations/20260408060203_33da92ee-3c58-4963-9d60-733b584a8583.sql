-- Migration 1: Add Klaviyo columns to brand_intelligence
ALTER TABLE brand_intelligence
  ADD COLUMN IF NOT EXISTS klaviyo_raw jsonb,
  ADD COLUMN IF NOT EXISTS klaviyo_report jsonb,
  ADD COLUMN IF NOT EXISTS klaviyo_compiled text,
  ADD COLUMN IF NOT EXISTS klaviyo_last_synced_at timestamptz;

-- Migration 2: Rebuild klaviyo_connections for new schema
DROP TABLE IF EXISTS klaviyo_connections;

CREATE TABLE klaviyo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  api_key text NOT NULL,
  klaviyo_account_id text,
  klaviyo_account_name text,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text DEFAULT 'pending',
  sync_error text,
  cached_lists jsonb DEFAULT '[]',
  cached_segments jsonb DEFAULT '[]',
  UNIQUE(brand_id)
);

ALTER TABLE klaviyo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their klaviyo connections"
  ON klaviyo_connections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = klaviyo_connections.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = klaviyo_connections.brand_id AND brands.user_id = auth.uid()));

-- Service role needs full access for edge functions
CREATE POLICY "Service role full access to klaviyo connections"
  ON klaviyo_connections FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.validate_klaviyo_sync_status()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.sync_status NOT IN ('pending', 'syncing', 'complete', 'failed') THEN
    RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_klaviyo_sync_status
  BEFORE INSERT OR UPDATE ON klaviyo_connections
  FOR EACH ROW EXECUTE FUNCTION public.validate_klaviyo_sync_status();