
-- Fix the overly permissive admin policy on reference_campaigns
DROP POLICY "Admins can manage all references" ON public.reference_campaigns;

CREATE POLICY "Admins can insert references"
  ON public.reference_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update references"
  ON public.reference_campaigns
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete references"
  ON public.reference_campaigns
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
