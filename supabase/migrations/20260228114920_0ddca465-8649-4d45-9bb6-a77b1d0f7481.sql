
-- Drop existing permissive storage policies that lack ownership checks
DROP POLICY IF EXISTS "Users can upload to their case folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their case documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their case documents" ON storage.objects;

-- Create a helper function to check case ownership from a file path
-- File paths follow the pattern: {caseId}/{docType}/{fileName}
CREATE OR REPLACE FUNCTION public.owns_case_document(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = (split_part(object_name, '/', 1))::uuid
      AND (conveyancer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
$$;

-- SELECT: Users can only view documents for cases they own (or admins)
CREATE POLICY "Users can view their case documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'case-documents'
  AND public.owns_case_document(name)
);

-- INSERT: Users can only upload to cases they own (or admins)
CREATE POLICY "Users can upload to their case folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'case-documents'
  AND public.owns_case_document(name)
);

-- DELETE: Users can only delete documents for cases they own (or admins)
CREATE POLICY "Users can delete their case documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'case-documents'
  AND public.owns_case_document(name)
);

-- UPDATE (for upserts): Users can only update documents for cases they own (or admins)
CREATE POLICY "Users can update their case documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'case-documents'
  AND public.owns_case_document(name)
);
