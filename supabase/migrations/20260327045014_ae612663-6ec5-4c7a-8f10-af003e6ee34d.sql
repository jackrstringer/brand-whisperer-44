CREATE POLICY "Admins can view all references"
ON public.reference_campaigns
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));