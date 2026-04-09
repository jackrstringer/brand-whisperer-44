CREATE TABLE public.generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  payload jsonb,
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_generation_events_campaign ON public.generation_events (campaign_id, created_at ASC);

ALTER TABLE public.generation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view generation events"
  ON public.generation_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert generation events"
  ON public.generation_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access to generation events"
  ON public.generation_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);