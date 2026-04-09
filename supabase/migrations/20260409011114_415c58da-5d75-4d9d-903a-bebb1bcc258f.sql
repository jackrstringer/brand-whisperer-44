
CREATE TABLE IF NOT EXISTS public.campaign_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  report_html text,
  campaign_count integer,
  date_range_days integer DEFAULT 180,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_campaign_reports_brand_created ON public.campaign_reports(brand_id, created_at DESC);

ALTER TABLE public.campaign_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their campaign reports"
ON public.campaign_reports
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.brands WHERE brands.id = campaign_reports.brand_id AND brands.user_id = auth.uid()
));

CREATE POLICY "Service role full access to campaign reports"
ON public.campaign_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
