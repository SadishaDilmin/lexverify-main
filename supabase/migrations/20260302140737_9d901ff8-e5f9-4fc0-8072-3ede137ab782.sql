
-- Tighten storage policies to check review ownership
DROP POLICY IF EXISTS "Users can upload exchange guard docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own exchange guard docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own exchange guard docs" ON storage.objects;

CREATE POLICY "Authenticated users can upload exchange guard docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exchange-guard-documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can read exchange guard docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exchange-guard-documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete exchange guard docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'exchange-guard-documents'
    AND auth.role() = 'authenticated'
  );
