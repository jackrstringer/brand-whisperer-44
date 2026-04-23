-- 1. flows: add canvas_state and trigger_config
ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS canvas_state jsonb,
  ADD COLUMN IF NOT EXISTS trigger_config jsonb;

-- 2. flow_emails: add canvas_position and node_config; expand node_type validation
ALTER TABLE public.flow_emails
  ADD COLUMN IF NOT EXISTS canvas_position jsonb,
  ADD COLUMN IF NOT EXISTS node_config jsonb;

-- Replace the node_type validation function to allow new node kinds
CREATE OR REPLACE FUNCTION public.validate_flow_email_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.node_type NOT IN (
    'email','delay','split','sms','push',
    'trigger','time_delay','conditional_split','trigger_split',
    'update_property','list_update','webhook','internal_alert','custom_action'
  ) THEN
    RAISE EXCEPTION 'Invalid flow_email node_type: %', NEW.node_type;
  END IF;
  IF NEW.generation_status NOT IN ('pending','generating','complete','failed','n_a') THEN
    RAISE EXCEPTION 'Invalid flow_email generation_status: %', NEW.generation_status;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. flow_edges: arbitrary topology
CREATE TABLE IF NOT EXISTS public.flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  source_handle text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_edges_flow_id ON public.flow_edges(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_edges_source ON public.flow_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_flow_edges_target ON public.flow_edges(target_node_id);

ALTER TABLE public.flow_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to flow_edges"
  ON public.flow_edges FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can manage flow_edges via brand"
  ON public.flow_edges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.flows f
    JOIN public.brands b ON b.id = f.brand_id
    WHERE f.id = flow_edges.flow_id AND b.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.flows f
    JOIN public.brands b ON b.id = f.brand_id
    WHERE f.id = flow_edges.flow_id AND b.user_id = auth.uid()
  ));

-- 4. flow_node_comments: notes per node
CREATE TABLE IF NOT EXISTS public.flow_node_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_email_id uuid NOT NULL,
  flow_id uuid NOT NULL,
  author_id uuid NOT NULL,
  author_name text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_node_comments_email ON public.flow_node_comments(flow_email_id);
CREATE INDEX IF NOT EXISTS idx_flow_node_comments_flow ON public.flow_node_comments(flow_id);

ALTER TABLE public.flow_node_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to flow_node_comments"
  ON public.flow_node_comments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can view flow node comments via brand"
  ON public.flow_node_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.flows f
    JOIN public.brands b ON b.id = f.brand_id
    WHERE f.id = flow_node_comments.flow_id AND b.user_id = auth.uid()
  ));

CREATE POLICY "Users can create flow node comments via brand"
  ON public.flow_node_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.flows f
      JOIN public.brands b ON b.id = f.brand_id
      WHERE f.id = flow_node_comments.flow_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own flow node comments"
  ON public.flow_node_comments FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own flow node comments"
  ON public.flow_node_comments FOR DELETE
  USING (auth.uid() = author_id);