CREATE POLICY "Users can update draft review docs"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'draft-review-documents'
  AND EXISTS (
    SELECT 1 FROM draft_reviews
    WHERE draft_reviews.id = (split_part(objects.name, '/', 1))::uuid
    AND (draft_reviews.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
)
WITH CHECK (
  bucket_id = 'draft-review-documents'
  AND EXISTS (
    SELECT 1 FROM draft_reviews
    WHERE draft_reviews.id = (split_part(objects.name, '/', 1))::uuid
    AND (draft_reviews.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);