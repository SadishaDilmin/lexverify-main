-- Drop overly permissive exchange-guard-documents storage policies
DROP POLICY IF EXISTS "Authenticated users can read exchange guard docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload exchange guard docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete exchange guard docs" ON storage.objects;

-- Scoped SELECT: owner or admin only
CREATE POLICY "Users can read own exchange guard docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exchange-guard-documents'
    AND EXISTS (
      SELECT 1 FROM public.exchange_guard_reviews
      WHERE id = (split_part(name, '/', 1))::uuid
      AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

-- Scoped INSERT: owner or admin only
CREATE POLICY "Users can upload own exchange guard docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exchange-guard-documents'
    AND EXISTS (
      SELECT 1 FROM public.exchange_guard_reviews
      WHERE id = (split_part(name, '/', 1))::uuid
      AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

-- Scoped DELETE: owner or admin only
CREATE POLICY "Users can delete own exchange guard docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'exchange-guard-documents'
    AND EXISTS (
      SELECT 1 FROM public.exchange_guard_reviews
      WHERE id = (split_part(name, '/', 1))::uuid
      AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );