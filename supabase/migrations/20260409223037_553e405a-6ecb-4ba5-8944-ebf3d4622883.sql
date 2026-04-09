-- Add run_id and event_key columns
ALTER TABLE public.generation_events
  ADD COLUMN IF NOT EXISTS run_id text,
  ADD COLUMN IF NOT EXISTS event_key text;

-- Index for fast queries scoped to a run
CREATE INDEX IF NOT EXISTS idx_generation_events_campaign_run
  ON public.generation_events (campaign_id, run_id);

-- Unique constraint for upsert support
ALTER TABLE public.generation_events
  ADD CONSTRAINT uq_generation_events_campaign_run_key
  UNIQUE (campaign_id, run_id, event_key);

-- Allow admins to update events (for upsert from client-side QA)
CREATE POLICY "Admins can update generation events"
  ON public.generation_events FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Backfill: mark all legacy "started" events as "completed" since those runs are long finished
UPDATE public.generation_events
  SET status = 'completed', completed_at = COALESCE(completed_at, created_at)
  WHERE status = 'started' AND completed_at IS NULL AND created_at < now() - interval '5 minutes';