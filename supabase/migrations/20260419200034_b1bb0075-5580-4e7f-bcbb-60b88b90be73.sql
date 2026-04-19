
-- Add UPDATE policies and tighten brand-assets to user-folder scoping.
-- This fixes "new row violates row-level security policy" on upsert overwrites.

-- ── brand-references: add UPDATE (folder-scoped) ──
CREATE POLICY "Users can update their brand references"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'brand-references' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'brand-references' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ── brand-assets: replace broad authenticated policies with folder-scoped ones ──
DROP POLICY IF EXISTS "Authenticated users can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read brand assets" ON storage.objects;

CREATE POLICY "Brand assets are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'brand-assets');

CREATE POLICY "Users can upload their brand assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their brand assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'brand-assets' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'brand-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their brand assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'brand-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
