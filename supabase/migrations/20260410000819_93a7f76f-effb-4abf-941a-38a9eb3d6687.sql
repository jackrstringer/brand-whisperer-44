INSERT INTO storage.buckets (id, name, public)
VALUES ('qa-artifacts', 'qa-artifacts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view qa artifacts"
ON storage.objects FOR SELECT
USING (bucket_id = 'qa-artifacts');

CREATE POLICY "Authenticated users can upload qa artifacts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'qa-artifacts' AND auth.role() = 'authenticated');